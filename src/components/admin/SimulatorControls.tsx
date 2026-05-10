"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SIM_MODULES, type ModuleName, type GeneratorResult, type WipeResult } from "@/lib/sim/types";

interface User {
  id: string;
  display_name: string;
}

const MODULE_LABELS: Record<ModuleName, string> = {
  roster: "Roster & enrollment",
  scramble: "Scramble (teams + scores)",
  daily_contests: "Daily contests (CTP / LD / LP)",
  hundred_feet: "100 Feet",
  pickem: "Pickem",
  calcutta: "Calcutta",
  cornhole: "Cornhole",
  kgb_cup: "KGB Cup",
  tee_times: "Tee times",
};

// All 9 generators implemented as of #128 Phase 2/3. Kept as a Set so
// future additions / placeholder states remain easy to wire.
const IMPLEMENTED_MODULES: ReadonlySet<ModuleName> = new Set([
  "roster", "scramble", "daily_contests", "hundred_feet",
  "pickem", "calcutta", "cornhole", "kgb_cup", "tee_times",
]);

function getDayDate(startDate: string, dayNum: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + dayNum - 1);
  const yy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function formatDateLabel(startDate: string, dayNum: number): string {
  const [y, m, d] = startDate.split("-").map(Number);
  const date = new Date(y, m - 1, d + dayNum - 1);
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

interface TestEvent {
  id: string;
  trip_name: string;
  trip_year: number;
}

export function SimulatorControls({
  users,
  tripStartDate,
  currentSimUserId,
  eventDays = [],
}: {
  users: User[];
  tripStartDate: string | null;
  currentSimUserId: string | null;
  eventDays?: { day_number: number; name: string }[];
}) {
  const router = useRouter();
  const [currentSimDate, setCurrentSimDate] = useState<string | null>(null);
  const [simDate, setSimDate] = useState("");
  const [simTime, setSimTime] = useState("");
  const [simUserId, setSimUserId] = useState(currentSimUserId || "");
  const [testEvent, setTestEvent] = useState<TestEvent | null>(null);
  const [simTripId, setSimTripId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedModules, setSelectedModules] = useState<Set<ModuleName>>(new Set());
  const [generatorResults, setGeneratorResults] = useState<GeneratorResult[] | null>(null);
  const [wipeResults, setWipeResults] = useState<WipeResult[] | null>(null);
  const [scaffoldResult, setScaffoldResult] = useState<{ inserted: Record<string, number>; warnings: string[] } | null>(null);

  useEffect(() => {
    async function fetchSimState() {
      try {
        const res = await fetch("/api/admin/simulator");
        if (res.ok) {
          const data = await res.json();
          const sd = data.simDate || null;
          setCurrentSimDate(sd);
          if (sd) {
            setSimDate(sd.includes("T") ? sd.split("T")[0] : sd);
            setSimTime(sd.includes("T") ? sd.split("T")[1] : "");
          }
          setTestEvent(data.testEvent || null);
          setSimTripId(data.simTripId || null);
        }
      } finally {
        setLoading(false);
      }
    }
    fetchSimState();
  }, []);

  async function createTestEvent() {
    setSaving(true);
    const res = await fetch("/api/admin/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ createTestEvent: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSimTripId(data.testTripId);
      const sync = await fetch("/api/admin/simulator");
      if (sync.ok) {
        const next = await sync.json();
        setTestEvent(next.testEvent || null);
      }
      router.refresh();
    } else if (data.error) {
      alert(data.error);
    }
    setSaving(false);
  }

  async function resyncTestEvent() {
    if (!confirm("Replace the existing test event with a fresh clone of the active event? All current test data will be lost.")) return;
    setSaving(true);
    const res = await fetch("/api/admin/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resyncTestEvent: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      setSimTripId(data.testTripId);
      setGeneratorResults(null);
      setWipeResults(null);
      setScaffoldResult(null);
      const sync = await fetch("/api/admin/simulator");
      if (sync.ok) {
        const next = await sync.json();
        setTestEvent(next.testEvent || null);
      }
      router.refresh();
    } else if (data.error) {
      alert(data.error);
    }
    setSaving(false);
  }

  async function enterSimMode() {
    setSaving(true);
    const res = await fetch("/api/admin/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enterSimMode: true }),
    });
    if (res.ok && testEvent) {
      setSimTripId(testEvent.id);
      router.refresh();
    }
    setSaving(false);
  }

  async function exitSimMode() {
    setSaving(true);
    await fetch("/api/admin/simulator", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearDate: false, clearUser: false, clearTrip: true }),
    });
    setSimTripId(null);
    setGeneratorResults(null);
    setWipeResults(null);
    router.refresh();
    setSaving(false);
  }

  function toggleModule(m: ModuleName) {
    setSelectedModules((prev) => {
      const next = new Set(prev);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return next;
    });
  }

  async function runPopulate(scope: "selected" | "all") {
    if (scope === "selected" && selectedModules.size === 0) return;
    setSaving(true);
    setGeneratorResults(null);
    const body = scope === "all"
      ? { all: true }
      : { modules: Array.from(selectedModules) };
    const res = await fetch("/api/admin/sim/populate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setGeneratorResults(data.results || []);
    router.refresh();
    setSaving(false);
  }

  async function runScaffold() {
    setSaving(true);
    setScaffoldResult(null);
    const res = await fetch("/api/admin/sim/scaffold", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (data.inserted) {
      setScaffoldResult({ inserted: data.inserted, warnings: data.warnings || [] });
    }
    router.refresh();
    setSaving(false);
  }

  async function runWipe(scope: "selected" | "all") {
    if (scope === "selected" && selectedModules.size === 0) return;
    if (scope === "all" && !confirm("Wipe ALL data in the test event? Contests/options/cost items are kept.")) return;
    setSaving(true);
    setWipeResults(null);
    const body = scope === "all"
      ? { all: true }
      : { modules: Array.from(selectedModules) };
    const res = await fetch("/api/admin/sim/wipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    setWipeResults(data.results || []);
    router.refresh();
    setSaving(false);
  }

  function buildSimDateValue(): string {
    if (!simDate) return "";
    return simTime ? `${simDate}T${simTime}` : simDate;
  }

  async function activateDate() {
    const value = buildSimDateValue();
    if (!value) return;
    setSaving(true);
    await fetch("/api/admin/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simDate: value }),
    });
    setCurrentSimDate(value);
    router.refresh();
    setSaving(false);
  }

  async function clearDate() {
    setSaving(true);
    await fetch("/api/admin/simulator", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearDate: true, clearUser: false }),
    });
    setCurrentSimDate(null);
    setSimDate("");
    setSimTime("");
    router.refresh();
    setSaving(false);
  }

  async function activateUser() {
    if (!simUserId) return;
    setSaving(true);
    await fetch("/api/admin/simulator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ simUserId }),
    });
    router.refresh();
    router.push("/");
    setSaving(false);
  }

  async function clearUser() {
    setSaving(true);
    await fetch("/api/admin/simulator", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clearDate: false, clearUser: true }),
    });
    setSimUserId("");
    router.refresh();
    setSaving(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-center text-gray-400 text-sm">
          Loading simulator...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Trip Simulator (issue #126 — admin sandbox) */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-emerald-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-emerald-800 uppercase tracking-wide flex items-center gap-2">
            <span aria-hidden>🧪</span>
            Trip Simulator
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">
            View the entire app as if a permanent <strong>test event</strong> were the active event.
            Real Loozers never see it; only admins with sim mode on. Safe to use during a live tournament.
          </p>

          {!testEvent ? (
            <div className="space-y-2">
              <p className="text-xs text-gray-600">
                No test event exists yet. Create one as a structural clone
                of the current active event — same contests, options, cost
                items, payout rows. Per-year data (scores, participants)
                stays empty for the sim generators to fill.
              </p>
              <button
                onClick={createTestEvent}
                disabled={saving}
                className="w-full bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {saving ? "Cloning…" : "Create test event from active event"}
              </button>
            </div>
          ) : (
            <>
              <div className="text-xs text-gray-600">
                Test event:{" "}
                <span className="font-medium text-gray-900">
                  {testEvent.trip_name}
                </span>{" "}
                <span className="text-gray-400">({testEvent.trip_year})</span>
              </div>

              {simTripId ? (
                <>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2 text-xs font-semibold text-emerald-800 flex items-center gap-2">
                    <span aria-hidden>🧪</span>
                    SIM MODE ACTIVE — viewing the test event everywhere
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={exitSimMode}
                      disabled={saving}
                      className="flex-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {saving ? "Exiting…" : "Exit sim mode"}
                    </button>
                    <button
                      onClick={resyncTestEvent}
                      disabled={saving}
                      className="flex-1 bg-sky-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                      title="Replace this test event with a fresh clone of the active event"
                    >
                      {saving ? "Syncing…" : "Re-sync from active"}
                    </button>
                  </div>

                  {/* Populate / wipe — issue #128 */}
                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Populate test event
                    </p>
                    <p className="text-xs text-gray-500">
                      The test event mirrors the active event&apos;s structure (contests,
                      options, cost items). Use these buttons to fill in scores,
                      participants, and winners.
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SIM_MODULES.map((m) => {
                        const impl = IMPLEMENTED_MODULES.has(m);
                        return (
                          <label
                            key={m}
                            className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded border ${
                              selectedModules.has(m)
                                ? "bg-emerald-50 border-emerald-300"
                                : "bg-white border-gray-200"
                            } ${impl ? "" : "opacity-60"}`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedModules.has(m)}
                              onChange={() => toggleModule(m)}
                              className="rounded"
                            />
                            <span className="flex-1">{MODULE_LABELS[m]}</span>
                            {!impl && (
                              <span className="text-[9px] uppercase font-bold text-gray-400">
                                soon
                              </span>
                            )}
                          </label>
                        );
                      })}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => runPopulate("selected")}
                        disabled={saving || selectedModules.size === 0}
                        className="flex-1 bg-emerald-600 text-white rounded-lg py-2 text-xs font-medium disabled:opacity-50"
                      >
                        Populate selected
                      </button>
                      <button
                        onClick={() => runPopulate("all")}
                        disabled={saving}
                        className="flex-1 bg-emerald-700 text-white rounded-lg py-2 text-xs font-medium disabled:opacity-50"
                      >
                        Populate everything
                      </button>
                    </div>
                  </div>

                  {generatorResults && generatorResults.length > 0 && (
                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2 space-y-1 text-xs">
                      {generatorResults.map((r) => {
                        const ok = r.warnings.length === 0;
                        return (
                          <div key={r.module} className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-gray-800">{MODULE_LABELS[r.module]}</span>
                            <span className={ok ? "text-emerald-700" : "text-amber-700"}>
                              {r.inserted > 0 ? `+${r.inserted} rows` : ""}
                              {r.warnings.length > 0 && ` · ${r.warnings.length} warning${r.warnings.length === 1 ? "" : "s"}`}
                            </span>
                          </div>
                        );
                      })}
                      {generatorResults.some((r) => r.warnings.length > 0) && (
                        <details className="text-[10px] text-gray-500 pt-1">
                          <summary className="cursor-pointer">Warnings</summary>
                          {generatorResults
                            .flatMap((r) => r.warnings.map((w) => `${r.module}: ${w}`))
                            .map((w, i) => (
                              <div key={i} className="pl-2">• {w}</div>
                            ))}
                        </details>
                      )}
                    </div>
                  )}

                  <div className="pt-3 border-t border-gray-100 space-y-2">
                    <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                      Wipe test event data
                    </p>
                    <p className="text-xs text-gray-500">
                      Clears scores / winners / participants for the selected modules
                      (or everything). Contests / options / cost items are kept so you don&apos;t
                      reconfigure each time.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => runWipe("selected")}
                        disabled={saving || selectedModules.size === 0}
                        className="flex-1 bg-gray-100 text-gray-700 border border-gray-200 rounded-lg py-2 text-xs font-medium disabled:opacity-50"
                      >
                        Wipe selected
                      </button>
                      <button
                        onClick={() => runWipe("all")}
                        disabled={saving}
                        className="flex-1 bg-red-50 text-red-700 border border-red-200 rounded-lg py-2 text-xs font-medium disabled:opacity-50"
                      >
                        Wipe all data
                      </button>
                    </div>
                  </div>

                  {wipeResults && wipeResults.length > 0 && (
                    <div className="rounded-lg bg-gray-50 border border-gray-200 p-2 space-y-1 text-xs">
                      {wipeResults.map((r) => {
                        const total = Object.values(r.deleted).reduce((s, n) => s + n, 0);
                        return (
                          <div key={r.module} className="flex items-baseline justify-between gap-2">
                            <span className="font-medium text-gray-800">{MODULE_LABELS[r.module]}</span>
                            <span className="text-gray-600">
                              −{total} row{total === 1 ? "" : "s"}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <button
                  onClick={enterSimMode}
                  disabled={saving}
                  className="w-full bg-emerald-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving ? "Entering…" : "Enter sim mode"}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Time Simulator */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-amber-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-amber-800 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Time Simulator
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">
            Override the current date and time. If no time is set, defaults to midnight.
          </p>

          <div className="flex gap-2">
            <input
              type="date"
              value={simDate}
              onChange={(e) => setSimDate(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
            />
            <input
              type="time"
              value={simTime}
              onChange={(e) => setSimTime(e.target.value)}
              placeholder="00:00"
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
            />
          </div>

          {tripStartDate && (
            <div className="flex gap-2">
              {(eventDays.length > 0 ? eventDays.map((d) => d.day_number) : [1, 2, 3, 4]).map((dayNum) => (
                <button
                  key={dayNum}
                  onClick={() => setSimDate(getDayDate(tripStartDate, dayNum))}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold border transition-colors ${
                    simDate === getDayDate(tripStartDate, dayNum)
                      ? "bg-amber-100 border-amber-400 text-amber-800"
                      : "bg-gray-50 border-gray-200 text-gray-600 active:bg-gray-100"
                  }`}
                >
                  Day {dayNum}
                  <br />
                  <span className="text-[10px] font-normal">
                    {formatDateLabel(tripStartDate, dayNum)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={activateDate}
              disabled={!simDate || saving}
              className="flex-1 bg-amber-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {currentSimDate ? "Update" : "Activate"}
            </button>
            {currentSimDate && (
              <button
                onClick={clearDate}
                disabled={saving}
                className="px-4 text-sm text-gray-500 border border-gray-200 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>

          {currentSimDate && (
            <p className="text-xs text-amber-700 font-medium">
              Active: simulating {(() => {
                const datePart = currentSimDate.includes("T") ? currentSimDate.split("T")[0] : currentSimDate;
                const timePart = currentSimDate.includes("T") ? currentSimDate.split("T")[1] : null;
                const dateLabel = new Date(datePart + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
                if (timePart) {
                  const [h, m] = timePart.split(":").map(Number);
                  const ampm = h >= 12 ? "PM" : "AM";
                  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                  return `${dateLabel} at ${h12}:${String(m).padStart(2, "0")} ${ampm}`;
                }
                return `${dateLabel} (midnight)`;
              })()}
            </p>
          )}
        </div>
      </div>

      {/* User Simulator */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 bg-purple-50 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-purple-800 uppercase tracking-wide flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            User Simulator
          </h2>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-xs text-gray-500">
            View the app as another user. Admin features will be hidden.
          </p>

          <select
            value={simUserId}
            onChange={(e) => setSimUserId(e.target.value)}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
          >
            <option value="">Select a user...</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>

          <div className="flex gap-2">
            <button
              onClick={activateUser}
              disabled={!simUserId || saving}
              className="flex-1 bg-purple-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {currentSimUserId ? "Switch User" : "Become This User"}
            </button>
            {currentSimUserId && (
              <button
                onClick={clearUser}
                disabled={saving}
                className="px-4 text-sm text-gray-500 border border-gray-200 rounded-lg"
              >
                Clear
              </button>
            )}
          </div>

          {currentSimUserId && (
            <p className="text-xs text-purple-700 font-medium">
              Active: viewing as {users.find((u) => u.id === currentSimUserId)?.display_name || "Unknown"}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
