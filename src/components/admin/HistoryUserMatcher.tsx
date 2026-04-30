"use client";

import { useEffect, useMemo, useState } from "react";

interface UserRow {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  workbook_name: string | null;
  is_active: boolean;
  is_system: boolean;
  is_financial_only: boolean;
}

interface LoozerRow {
  workbookName: string;
  firstName: string;
  lastName: string;
  sheetsAppearedIn: string[];
  matchedUserId: string | null;
  suggestedUserId: string | null;
}

interface State {
  parsed: { trips: { year: number; generation: string }[]; awardCount: number; warnings: string[] };
  loozers: LoozerRow[];
  users: UserRow[];
  trips: { id: string; year: number; name: string; status: string; importedAccoladeCount: number }[];
}

type Filter = "all" | "unmatched" | "suggested" | "matched";

export function HistoryUserMatcher() {
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("unmatched");
  const [savingFor, setSavingFor] = useState<string | null>(null);
  const [autoRunning, setAutoRunning] = useState(false);
  const [autoResult, setAutoResult] = useState<{ applied: number; totalLoozers: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/admin/history/state")
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setState(data);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const reload = async () => {
    const res = await fetch("/api/admin/history/state");
    const data = await res.json();
    setState(data);
  };

  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of state?.users ?? []) m.set(u.id, u);
    return m;
  }, [state]);

  const counts = useMemo(() => {
    if (!state) return { all: 0, unmatched: 0, suggested: 0, matched: 0 };
    let unmatched = 0,
      suggested = 0,
      matched = 0;
    for (const l of state.loozers) {
      if (l.matchedUserId) matched += 1;
      else if (l.suggestedUserId) suggested += 1;
      else unmatched += 1;
    }
    return { all: state.loozers.length, unmatched, suggested, matched };
  }, [state]);

  const visible = useMemo(() => {
    if (!state) return [];
    const q = search.trim().toLowerCase();
    return state.loozers.filter((l) => {
      const isMatched = !!l.matchedUserId;
      const isSuggested = !isMatched && !!l.suggestedUserId;
      const isUnmatched = !isMatched && !isSuggested;
      if (filter === "matched" && !isMatched) return false;
      if (filter === "suggested" && !isSuggested) return false;
      if (filter === "unmatched" && !isUnmatched) return false;
      if (!q) return true;
      const hay = [
        l.workbookName,
        l.firstName,
        l.lastName,
        usersById.get(l.matchedUserId ?? "")?.display_name,
        usersById.get(l.matchedUserId ?? "")?.full_name,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [state, search, filter, usersById]);

  const setMatch = async (workbookName: string, userId: string | null) => {
    setSavingFor(workbookName);
    const res = await fetch("/api/admin/history/match", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workbookName, userId }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(`Failed: ${body.error ?? res.status}`);
    }
    setSavingFor(null);
    await reload();
  };

  const runAutoMatch = async () => {
    setAutoRunning(true);
    setAutoResult(null);
    const res = await fetch("/api/admin/history/auto-match", { method: "POST" });
    const data = await res.json();
    setAutoResult({ applied: data.applied, totalLoozers: data.totalLoozers });
    setAutoRunning(false);
    await reload();
  };

  if (loading || !state) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Sort users for the picker: real Loozers first, then financial-only, then system bots
  const pickableUsers = [...state.users].sort((a, b) => {
    const score = (u: UserRow) =>
      (u.is_system ? 2 : 0) + (u.is_financial_only ? 1 : 0);
    const s = score(a) - score(b);
    if (s !== 0) return s;
    return (a.full_name ?? a.display_name).localeCompare(b.full_name ?? b.display_name);
  });

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-4 gap-3 text-center">
          <Stat label="Loozers" value={counts.all} />
          <Stat label="Matched" value={counts.matched} tone="green" />
          <Stat label="Suggested" value={counts.suggested} tone="amber" />
          <Stat label="Unmatched" value={counts.unmatched} tone="red" />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
          <span>
            Workbook: {state.parsed.trips.length} years, {state.parsed.awardCount} awards
          </span>
          <button
            onClick={runAutoMatch}
            disabled={autoRunning}
            className="px-3 py-1.5 rounded-lg bg-green-600 text-white text-xs font-medium disabled:opacity-50 active:scale-95 transition-transform"
          >
            {autoRunning ? "Matching…" : "Auto-match unambiguous"}
          </button>
        </div>
        {autoResult && (
          <p className="mt-2 text-xs text-green-700">
            Applied {autoResult.applied} of {autoResult.totalLoozers} unambiguous matches.
          </p>
        )}
        {state.parsed.warnings.length > 0 && (
          <div className="mt-3 text-xs text-amber-700 bg-amber-50 rounded-lg p-2 space-y-1">
            {state.parsed.warnings.map((w, i) => (
              <div key={i}>• {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* Filters + search */}
      <div className="space-y-2">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {(["unmatched", "suggested", "matched", "all"] as Filter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap ${
                filter === f
                  ? "bg-green-600 text-white"
                  : "bg-white border border-gray-200 text-gray-700"
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}{" "}
              <span className="opacity-75">({counts[f]})</span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workbook names or users…"
          className="w-full border border-gray-300 rounded-xl px-3 py-2 text-[16px]"
        />
      </div>

      {/* List */}
      <div className="space-y-2">
        {visible.length === 0 && (
          <div className="text-center text-sm text-gray-400 py-8">No Loozers match the current filter.</div>
        )}
        {visible.map((l) => {
          const matched = l.matchedUserId ? usersById.get(l.matchedUserId) ?? null : null;
          const suggested = l.suggestedUserId ? usersById.get(l.suggestedUserId) ?? null : null;
          const saving = savingFor === l.workbookName;
          return (
            <div
              key={l.workbookName}
              className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-gray-900 truncate">{l.workbookName}</p>
                    <StatusBadge matched={!!matched} suggested={!!suggested && !matched} />
                  </div>
                  <p className="text-xs text-gray-500 truncate">
                    {l.firstName} {l.lastName}
                  </p>
                  <p className="text-[10px] text-gray-400 mt-1 truncate">
                    {l.sheetsAppearedIn.join(" · ")}
                  </p>
                </div>
                {matched && (
                  <button
                    onClick={() => setMatch(l.workbookName, null)}
                    disabled={saving}
                    className="text-xs text-red-600 px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>

              <div className="mt-2 flex items-center gap-2">
                <select
                  value={matched?.id ?? ""}
                  onChange={(e) => setMatch(l.workbookName, e.target.value || null)}
                  disabled={saving}
                  className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white"
                >
                  <option value="">— Pick a Loozer —</option>
                  {pickableUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {(u.full_name ?? u.display_name) +
                        (u.full_name && u.full_name !== u.display_name ? ` · ${u.display_name}` : "") +
                        (u.is_system ? " · bot" : "") +
                        (u.is_financial_only ? " · finOnly" : "")}
                    </option>
                  ))}
                </select>
                {suggested && !matched && (
                  <button
                    onClick={() => setMatch(l.workbookName, suggested.id)}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-medium whitespace-nowrap disabled:opacity-50 active:scale-95 transition-transform"
                  >
                    {saving ? "…" : `✓ ${suggested.full_name ?? suggested.display_name}`}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: number;
  tone?: "gray" | "green" | "amber" | "red";
}) {
  const colors = {
    gray: "text-gray-900",
    green: "text-green-700",
    amber: "text-amber-700",
    red: "text-red-700",
  } as const;
  return (
    <div>
      <p className={`text-xl font-bold ${colors[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}

function StatusBadge({ matched, suggested }: { matched: boolean; suggested: boolean }) {
  if (matched)
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-800 font-medium">
        matched
      </span>
    );
  if (suggested)
    return (
      <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-medium">
        suggested
      </span>
    );
  return (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 font-medium">
      unmatched
    </span>
  );
}
