"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface User {
  id: string;
  display_name: string;
}

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

export function SimulatorControls({
  users,
  tripStartDate,
  currentSimDate,
  currentSimUserId,
}: {
  users: User[];
  tripStartDate: string | null;
  currentSimDate: string | null;
  currentSimUserId: string | null;
}) {
  const router = useRouter();
  // Parse existing sim date cookie into date and time parts
  const initialDate = currentSimDate?.includes("T")
    ? currentSimDate.split("T")[0]
    : currentSimDate || "";
  const initialTime = currentSimDate?.includes("T")
    ? currentSimDate.split("T")[1]
    : "";
  const [simDate, setSimDate] = useState(initialDate);
  const [simTime, setSimTime] = useState(initialTime);
  const [simUserId, setSimUserId] = useState(currentSimUserId || "");
  const [saving, setSaving] = useState(false);

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

  return (
    <div className="space-y-6">
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
              {[1, 2, 3, 4].map((dayNum) => (
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
