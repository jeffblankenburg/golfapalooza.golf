"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

// ── Types ──────────────────────────────────────────────────────────────

interface Contest {
  id: string;
  name: string;
  contest_date: string | null;
  entry_fee: number;
}

interface Trip {
  id: string;
  trip_name: string;
  trip_year: number;
  start_date: string;
}

interface GridUser {
  user_id: string;
  display_name: string;
  balance: number;
}

interface Column {
  id: string;
  label: string;
  sublabel?: string;
  type: "trip" | "contest";
}

// ── Helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

const fmtCompact = (n: number) => {
  if (n === 0) return "$0";
  const sign = n > 0 ? "+" : "";
  return (
    sign +
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
};

const balColor = (n: number) =>
  n < 0 ? "text-red-600" : n > 0 ? "text-green-600" : "text-gray-500";

// ── Component ──────────────────────────────────────────────────────────

interface CellTransaction {
  id: string;
  type: "charge" | "payment";
  source: string;
  description: string;
  amount: number;
  created_at: string;
}

export function FinancialGrid() {
  const [columns, setColumns] = useState<Column[]>([]);
  const [users, setUsers] = useState<GridUser[]>([]);
  const [cellData, setCellData] = useState<Record<string, Record<string, number>>>({});
  const [participation, setParticipation] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Cell drill-down
  const [cellModal, setCellModal] = useState<{
    userId: string;
    colId: string;
    userName: string;
    colLabel: string;
  } | null>(null);
  const [cellTxns, setCellTxns] = useState<CellTransaction[]>([]);
  const [cellTxnsLoading, setCellTxnsLoading] = useState(false);

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/financials/balances");
    const data = await res.json();

    const trips: Trip[] = data.trips || [];
    const contests: Contest[] = data.contests || [];

    // Build columns: trips and contests sorted together by date desc
    const cols: (Column & { sortDate: string })[] = [
      ...trips.map((t) => ({
        id: `trip:${t.id}`,
        label: t.trip_name,
        sublabel: String(t.trip_year),
        type: "trip" as const,
        sortDate: t.start_date || `${t.trip_year}-01-01`,
      })),
      ...contests.map((c) => ({
        id: `contest:${c.id}`,
        label: c.name,
        sublabel: c.contest_date
          ? new Date(c.contest_date + "T00:00:00").toLocaleDateString("en-US", {
              month: "short",
              year: "2-digit",
            })
          : undefined,
        type: "contest" as const,
        sortDate: c.contest_date || "0000-00-00",
      })),
    ];
    cols.sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    setColumns(cols);

    // Users
    setUsers(
      (data.users || []).map((u: GridUser) => ({
        user_id: u.user_id,
        display_name: u.display_name,
        balance: u.balance,
      }))
    );

    // Cell data: merge trip_balances and contest_balances into one map keyed by column id
    const cells: Record<string, Record<string, number>> = {};
    const tripBal = data.trip_balances || {};
    const contestBal = data.contest_balances || {};

    for (const userId of Object.keys(tripBal)) {
      if (!cells[userId]) cells[userId] = {};
      for (const tripId of Object.keys(tripBal[userId])) {
        cells[userId][`trip:${tripId}`] = tripBal[userId][tripId];
      }
    }
    for (const userId of Object.keys(contestBal)) {
      if (!cells[userId]) cells[userId] = {};
      for (const contestId of Object.keys(contestBal[userId])) {
        cells[userId][`contest:${contestId}`] = contestBal[userId][contestId];
      }
    }
    setCellData(cells);

    // Participation: build per-column sets of user IDs
    const parts: Record<string, Set<string>> = {};
    const contestParts = data.contest_participants || {};
    const eventParts = data.event_participants || {};

    for (const contestId of Object.keys(contestParts)) {
      parts[`contest:${contestId}`] = new Set(contestParts[contestId]);
    }
    for (const tripId of Object.keys(eventParts)) {
      parts[`trip:${tripId}`] = new Set(eventParts[tripId]);
    }
    setParticipation(parts);
  }, []);

  const openCellModal = useCallback(
    async (userId: string, col: Column, userName: string) => {
      setCellModal({ userId, colId: col.id, userName, colLabel: col.label });
      setCellTxnsLoading(true);

      // Build query params based on column type
      const rawId = col.id.split(":")[1];
      const param =
        col.type === "trip"
          ? `trip_id=${rawId}`
          : `financial_contest_id=${rawId}`;

      const res = await fetch(
        `/api/admin/financials/contest-ledger?user_id=${userId}&${param}`
      );
      const data = await res.json();
      setCellTxns(data.transactions || []);
      setCellTxnsLoading(false);
    },
    []
  );

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  const filtered = search
    ? users.filter((u) =>
        u.display_name.toLowerCase().includes(search.toLowerCase())
      )
    : users;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (columns.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-sm">
          No events or contests yet.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Back link */}
      <Link
        href="/admin/financials"
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Financials
      </Link>

      {/* Search */}
      <input
        type="text"
        placeholder="Search Loozers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
      />

      {/* Grid */}
      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[120px]">
                Loozer
              </th>
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[80px]"
                >
                  <div>{col.label}</div>
                  {col.sublabel && (
                    <div className="text-[10px] text-gray-400 font-normal">
                      {col.sublabel}
                    </div>
                  )}
                </th>
              ))}
              <th className="px-3 py-2 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider border-l border-gray-200 min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, rowIdx) => {
              const userCells = cellData[u.user_id] || {};

              return (
                <tr
                  key={u.user_id}
                  className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  <td
                    className={`sticky left-0 z-10 px-3 py-2 border-b border-gray-100 font-medium text-gray-900 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] ${
                      rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                  >
                    {u.display_name}
                  </td>
                  {columns.map((col) => {
                    const isParticipant = participation[col.id]?.has(u.user_id);
                    const val = userCells[col.id];

                    if (!isParticipant) {
                      return (
                        <td
                          key={col.id}
                          className="px-3 py-2 border-b border-gray-100 text-center"
                        />
                      );
                    }

                    const cellVal = val || 0;
                    return (
                      <td
                        key={col.id}
                        className="px-3 py-2 border-b border-gray-100 text-center cursor-pointer hover:bg-green-50 transition-colors"
                        onClick={() =>
                          openCellModal(u.user_id, col, u.display_name)
                        }
                      >
                        <span className={`text-xs font-medium ${balColor(cellVal)}`}>
                          {fmtCompact(cellVal)}
                        </span>
                      </td>
                    );
                  })}
                  <td
                    className={`px-3 py-2 border-b border-gray-100 border-l border-gray-200 text-center font-bold ${balColor(u.balance)}`}
                  >
                    {fmt(u.balance)}
                  </td>
                </tr>
              );
            })}

            {/* Footer totals */}
            <tr className="bg-gray-50 font-semibold border-t border-gray-200">
              <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-xs text-gray-600 uppercase tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                Totals
              </td>
              {columns.map((col) => {
                const colTotal = filtered.reduce((sum, u) => {
                  const isParticipant = participation[col.id]?.has(u.user_id);
                  if (!isParticipant) return sum;
                  return sum + ((cellData[u.user_id] || {})[col.id] || 0);
                }, 0);
                const rounded = Number(colTotal.toFixed(2));
                return (
                  <td
                    key={col.id}
                    className={`px-3 py-2 text-center text-xs ${balColor(rounded)}`}
                  >
                    {rounded !== 0 ? fmtCompact(rounded) : ""}
                  </td>
                );
              })}
              <td
                className={`px-3 py-2 text-center border-l border-gray-200 ${balColor(
                  filtered.reduce((sum, u) => sum + u.balance, 0)
                )}`}
              >
                {fmt(Number(filtered.reduce((sum, u) => sum + u.balance, 0).toFixed(2)))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cell Drill-Down Drawer */}
      {cellModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setCellModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[60vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold text-gray-900">
                {cellModal.userName}
              </h2>
              <p className="text-sm text-gray-500">{cellModal.colLabel}</p>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {cellTxnsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : cellTxns.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-2">
                  No transactions.
                </p>
              ) : (
                <div className="space-y-0 rounded-xl overflow-hidden border border-gray-100">
                  {cellTxns.map((tx, i) => (
                    <div
                      key={tx.id}
                      className={`flex items-center justify-between px-3 py-2 text-sm ${
                        i % 2 === 0 ? "bg-gray-50" : "bg-white"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-gray-400">
                            {new Date(tx.created_at).toLocaleDateString()}
                          </span>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              tx.type === "charge"
                                ? "bg-red-100 text-red-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {tx.type}
                          </span>
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                              tx.source === "manual"
                                ? "bg-gray-100 text-gray-600"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {tx.source}
                          </span>
                        </div>
                        <div className="text-gray-700 truncate">
                          {tx.description}
                        </div>
                      </div>
                      <span
                        className={`font-semibold whitespace-nowrap ml-2 ${
                          tx.type === "charge"
                            ? "text-red-600"
                            : "text-green-600"
                        }`}
                      >
                        {tx.type === "charge" ? "-" : "+"}
                        {fmt(tx.amount)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
