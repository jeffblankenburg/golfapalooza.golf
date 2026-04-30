"use client";

import { useEffect, useState } from "react";

const CATEGORIES = [
  "mvl",
  "roy",
  "melc",
  "bspitw",
  "green_jacket",
  "cornhole_singles",
  "cornhole_doubles",
] as const;
type Category = (typeof CATEGORIES)[number];

const LABEL: Record<Category, string> = {
  mvl: "MVL",
  roy: "ROY",
  melc: "MELC",
  bspitw: "BSPITW",
  green_jacket: "Green Jacket",
  cornhole_singles: "Cornhole 1s",
  cornhole_doubles: "Cornhole 2s",
};

interface CategoryRow {
  category: Category;
  imported: number;
  expectedFromSummary: number;
  expectedFromAwards: number;
  delta: number;
}

interface UserVerifyRow {
  userId: string;
  workbookName: string;
  displayName: string;
  fullName: string | null;
  imported: Partial<Record<Category, number>>;
  expected: Partial<Record<Category, number>>;
  hasMismatch: boolean;
}

interface State {
  matchedUserCount: number;
  totalAwardsInWorkbook: number;
  totalImported: number;
  categoryRows: CategoryRow[];
  userRows: UserVerifyRow[];
}

export function HistoryVerifier() {
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllUsers, setShowAllUsers] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/admin/history/verify");
        const text = await res.text();
        if (cancelled) return;
        if (!res.ok) {
          setError(`GET ${res.status}: ${text.slice(0, 500)}`);
          return;
        }
        try {
          setState(JSON.parse(text));
        } catch {
          setError(`Non-JSON response: ${text.slice(0, 500)}`);
        }
      } catch (e) {
        if (!cancelled) setError(`Fetch failed: ${(e as Error).message}`);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-2xl p-4 text-sm text-red-800">
        <p className="font-semibold mb-2">Verify failed to load</p>
        <pre className="text-xs whitespace-pre-wrap">{error}</pre>
      </div>
    );
  }

  if (!state) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const mismatchCount = state.userRows.filter((u) => u.hasMismatch).length;
  const visibleUsers = showAllUsers
    ? state.userRows
    : state.userRows.filter((u) => u.hasMismatch);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
        <div className="grid grid-cols-3 gap-3 text-center">
          <Stat label="Matched" value={state.matchedUserCount} />
          <Stat label="Imported" value={state.totalImported} tone="green" />
          <Stat
            label="Mismatches"
            value={mismatchCount}
            tone={mismatchCount === 0 ? "green" : "amber"}
          />
        </div>
        <p className="text-xs text-gray-500 text-center mt-2">
          Workbook has {state.totalAwardsInWorkbook} total awards. Mismatches compare per-user totals to the Summary sheet.
        </p>
      </div>

      {/* Per-category table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-3 py-2 text-left">Category</th>
              <th className="px-3 py-2 text-right">Imported</th>
              <th className="px-3 py-2 text-right">Summary</th>
              <th className="px-3 py-2 text-right">Awards sheet</th>
              <th className="px-3 py-2 text-right">Δ</th>
            </tr>
          </thead>
          <tbody>
            {state.categoryRows.map((c) => (
              <tr key={c.category} className="border-t border-gray-100">
                <td className="px-3 py-2 font-medium">{LABEL[c.category]}</td>
                <td className="px-3 py-2 text-right">{c.imported}</td>
                <td className="px-3 py-2 text-right text-gray-500">{c.expectedFromSummary}</td>
                <td className="px-3 py-2 text-right text-gray-500">{c.expectedFromAwards}</td>
                <td
                  className={`px-3 py-2 text-right font-medium ${c.delta === 0 ? "text-green-700" : "text-amber-700"}`}
                >
                  {c.delta === 0 ? "✓" : c.delta > 0 ? `+${c.delta}` : c.delta}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="px-3 py-2 text-[11px] text-gray-500 bg-gray-50 border-t border-gray-100">
          Imported is doubled for Cornhole 2s when comparing to Summary (Summary credits both teammates; Awards sheet stores one row per team).
        </p>
      </div>

      {/* Per-user mismatches */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-gray-50">
          <p className="text-xs uppercase text-gray-500 font-medium">
            {showAllUsers ? "All matched users" : `Mismatched users (${mismatchCount})`}
          </p>
          <button
            onClick={() => setShowAllUsers((v) => !v)}
            className="text-xs text-green-700 font-medium"
          >
            {showAllUsers ? "Hide matches" : "Show all"}
          </button>
        </div>
        {visibleUsers.length === 0 ? (
          <p className="text-center text-sm text-green-700 py-6">All matched users tally cleanly. ✓</p>
        ) : (
          <table className="w-full text-xs">
            <thead className="text-[10px] uppercase text-gray-500">
              <tr>
                <th className="px-2 py-1.5 text-left">Loozer</th>
                {CATEGORIES.map((c) => (
                  <th key={c} className="px-2 py-1.5 text-right" title={LABEL[c]}>
                    {LABEL[c].split(" ")[0]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleUsers.map((u) => (
                <tr key={u.userId} className="border-t border-gray-100">
                  <td className="px-2 py-1.5 truncate max-w-[140px]">
                    <span className="font-medium">{u.fullName ?? u.displayName}</span>
                    <span className="text-gray-400 ml-1">{u.workbookName}</span>
                  </td>
                  {CATEGORIES.map((c) => {
                    const i = u.imported[c] ?? 0;
                    const e = u.expected[c] ?? 0;
                    const ok = i === e;
                    return (
                      <td
                        key={c}
                        className={`px-2 py-1.5 text-right tabular-nums ${ok ? "text-gray-400" : "text-amber-700 font-semibold"}`}
                      >
                        {i}
                        {ok ? "" : `/${e}`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        )}
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
  tone?: "gray" | "green" | "amber";
}) {
  const colors = {
    gray: "text-gray-900",
    green: "text-green-700",
    amber: "text-amber-700",
  } as const;
  return (
    <div>
      <p className={`text-xl font-bold ${colors[tone]}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
    </div>
  );
}
