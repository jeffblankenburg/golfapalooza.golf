"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

// ── Types ─────────────────��─────────────────────��──────────────────────

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
  sortDate: string;
}

interface CellTransaction {
  id: string;
  type: "charge" | "payment";
  source: string;
  description: string;
  amount: number;
  created_at: string;
  trip_name?: string | null;
  contest_name?: string | null;
  created_by_name?: string | null;
  attributed_to?: string | null;
  has_history?: boolean;
  creator?: { display_name: string } | null;
}

interface PriorEvent {
  id: string;
  label: string;
  balance: number;
}

// ── Helpers ─────────────────────���──────────────────────────────────────

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

function getCutoffDate(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 13);
  return d.toISOString().slice(0, 10);
}

// ── Component ──────────────��───────────────────────────────────────────

export function FinancialGrid() {
  // Active columns (within 13 months)
  const [columns, setColumns] = useState<Column[]>([]);
  // Prior columns (older than 13 months) — kept for prior aggregation
  const [priorColumns, setPriorColumns] = useState<Column[]>([]);

  const [users, setUsers] = useState<GridUser[]>([]);
  const [cellData, setCellData] = useState<Record<string, Record<string, number>>>({});
  const [participation, setParticipation] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Cell drill-down
  const [cellModal, setCellModal] = useState<{
    userId: string;
    colId: string;
    userName: string;
    colLabel: string;
  } | null>(null);
  const [cellTxns, setCellTxns] = useState<CellTransaction[]>([]);
  const [cellTxnsLoading, setCellTxnsLoading] = useState(false);

  // Prior drill-down
  const [priorModal, setPriorModal] = useState<{
    userId: string;
    userName: string;
  } | null>(null);

  // Full user ledger
  const [userLedgerModal, setUserLedgerModal] = useState<{
    userId: string;
    userName: string;
  } | null>(null);
  const [userLedger, setUserLedger] = useState<CellTransaction[]>([]);
  const [userLedgerLoading, setUserLedgerLoading] = useState(false);
  const [ulDateFrom, setUlDateFrom] = useState("");
  const [ulDateTo, setUlDateTo] = useState("");
  const [ulSearch, setUlSearch] = useState("");
  const [ulSortDir, setUlSortDir] = useState<"asc" | "desc">("desc");

  const fetchData = useCallback(async () => {
    const res = await fetch("/api/admin/financials/balances");
    const data = await res.json();

    const trips: Trip[] = data.trips || [];
    const contests: Contest[] = data.contests || [];
    const cutoff = getCutoffDate();

    // Build all columns sorted oldest-first (left to right)
    const allCols: Column[] = [
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
    allCols.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

    // Split into prior (>13mo) and active
    const active = allCols.filter((c) => c.sortDate >= cutoff);
    const prior = allCols.filter((c) => c.sortDate < cutoff);
    setColumns(active);
    setPriorColumns(prior);

    // Users
    setUsers(
      (data.users || []).map((u: GridUser) => ({
        user_id: u.user_id,
        display_name: u.display_name,
        balance: u.balance,
      }))
    );

    // Cell data
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
    const uncat = data.uncategorized || {};
    for (const userId of Object.keys(uncat)) {
      if (!cells[userId]) cells[userId] = {};
      cells[userId]["_other"] = uncat[userId];
    }
    setCellData(cells);

    // Participation
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

  const openUserLedger = useCallback(async (userId: string, userName: string) => {
    const d = new Date();
    d.setMonth(d.getMonth() - 13);
    setUlDateFrom(d.toISOString().slice(0, 10));
    setUlDateTo(new Date().toISOString().slice(0, 10));
    setUlSearch("");
    setUlSortDir("desc");
    setUserLedgerModal({ userId, userName });
    setUserLedgerLoading(true);
    const res = await fetch(`/api/admin/financials/ledger?user_id=${userId}`);
    const data = await res.json();
    setUserLedger(data.transactions || []);
    setUserLedgerLoading(false);
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]);

  // ── Prior balance helpers ─────────��────────────────────────────────

  const getPriorBalance = (userId: string): number => {
    const userCells = cellData[userId] || {};
    let total = 0;
    for (const col of priorColumns) {
      const isParticipant = participation[col.id]?.has(userId);
      if (isParticipant) {
        total += userCells[col.id] || 0;
      }
    }
    return Number(total.toFixed(2));
  };

  const hasPriorData = (userId: string): boolean => {
    for (const col of priorColumns) {
      if (participation[col.id]?.has(userId)) return true;
    }
    return false;
  };

  const getPriorEvents = (userId: string): PriorEvent[] => {
    const userCells = cellData[userId] || {};
    const events: PriorEvent[] = [];
    for (const col of priorColumns) {
      if (participation[col.id]?.has(userId)) {
        events.push({
          id: col.id,
          label: col.label,
          balance: userCells[col.id] || 0,
        });
      }
    }
    return events;
  };

  // ── Sort ───────────────────────────────────────────────────────────

  const toggleSort = (colId: string) => {
    if (sortCol === colId) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortCol(colId);
      setSortDir("desc");
    }
  };

  const filtered = (
    search
      ? users.filter((u) =>
          u.display_name.toLowerCase().includes(search.toLowerCase())
        )
      : users
  ).slice().sort((a, b) => {
    if (!sortCol) return 0;
    if (sortCol === "_name") {
      const cmp = a.display_name.localeCompare(b.display_name);
      return sortDir === "asc" ? cmp : -cmp;
    }
    if (sortCol === "_total") {
      return sortDir === "desc" ? a.balance - b.balance : b.balance - a.balance;
    }
    if (sortCol === "_other") {
      const aVal = (cellData[a.user_id] || {})["_other"] || 0;
      const bVal = (cellData[b.user_id] || {})["_other"] || 0;
      if (!aVal && !bVal) return 0;
      if (!aVal) return 1;
      if (!bVal) return -1;
      return sortDir === "desc" ? aVal - bVal : bVal - aVal;
    }
    if (sortCol === "_prior") {
      const aHas = hasPriorData(a.user_id);
      const bHas = hasPriorData(b.user_id);
      if (!aHas && !bHas) return 0;
      if (!aHas) return 1;
      if (!bHas) return -1;
      const aVal = getPriorBalance(a.user_id);
      const bVal = getPriorBalance(b.user_id);
      return sortDir === "desc" ? aVal - bVal : bVal - aVal;
    }
    const aIsParticipant = participation[sortCol]?.has(a.user_id);
    const bIsParticipant = participation[sortCol]?.has(b.user_id);
    if (!aIsParticipant && !bIsParticipant) return 0;
    if (!aIsParticipant) return 1;
    if (!bIsParticipant) return -1;
    const aVal = (cellData[a.user_id] || {})[sortCol] || 0;
    const bVal = (cellData[b.user_id] || {})[sortCol] || 0;
    return sortDir === "desc" ? aVal - bVal : bVal - aVal;
  });

  // ── Sort indicator helper ─────────────��────────────────────────────

  const sortArrow = (colId: string) =>
    sortCol === colId ? (
      <span className="text-green-600">
        {sortDir === "desc" ? " ▼" : " ▲"}
      </span>
    ) : null;

  // ── Filtered user ledger ────────────────────────────────────────────

  const filteredUserLedger = useMemo(() => {
    const fromDate = ulDateFrom ? ulDateFrom + "T00:00:00.000Z" : "";
    const toDate = ulDateTo ? ulDateTo + "T23:59:59.999Z" : "";
    const q = ulSearch.toLowerCase();

    return userLedger
      .filter((tx) => {
        if (fromDate && tx.created_at < fromDate) return false;
        if (toDate && tx.created_at > toDate) return false;
        if (q && !tx.description.toLowerCase().includes(q)) return false;
        return true;
      })
      .sort((a, b) =>
        ulSortDir === "desc"
          ? b.created_at.localeCompare(a.created_at)
          : a.created_at.localeCompare(b.created_at)
      );
  }, [userLedger, ulDateFrom, ulDateTo, ulSearch, ulSortDir]);

  // ── Render ─────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (columns.length === 0 && priorColumns.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-400 text-sm">No events or contests yet.</p>
      </div>
    );
  }

  const hasPrior = priorColumns.length > 0;

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
              {/* Loozer header */}
              <th
                className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] min-w-[120px] cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => toggleSort("_name")}
              >
                <div className="flex items-center gap-0.5">
                  Loozer{sortArrow("_name")}
                </div>
              </th>

              {/* Prior header */}
              {hasPrior && (
                <th
                  className="px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[70px] cursor-pointer select-none hover:bg-gray-100 transition-colors border-r border-gray-200 bg-gray-100/50"
                  onClick={() => toggleSort("_prior")}
                >
                  <div className="flex items-center justify-center gap-0.5">
                    Prior{sortArrow("_prior")}
                  </div>
                </th>
              )}

              {/* Active column headers */}
              {columns.map((col) => (
                <th
                  key={col.id}
                  className="px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[80px] cursor-pointer select-none hover:bg-gray-100 transition-colors"
                  onClick={() => toggleSort(col.id)}
                >
                  <div className="flex items-center justify-center gap-0.5">
                    {col.label}{sortArrow(col.id)}
                  </div>
                  {col.sublabel && (
                    <div className="text-[10px] text-gray-400 font-normal">
                      {col.sublabel}
                    </div>
                  )}
                </th>
              ))}

              {/* Other header */}
              <th
                className="px-3 py-2 text-center text-xs font-semibold text-gray-600 whitespace-nowrap min-w-[70px] cursor-pointer select-none hover:bg-gray-100 transition-colors border-l border-gray-200 bg-gray-100/50"
                onClick={() => toggleSort("_other")}
              >
                <div className="flex items-center justify-center gap-0.5">
                  Other{sortArrow("_other")}
                </div>
              </th>

              {/* Total header */}
              <th
                className="px-3 py-2 text-center text-xs font-semibold text-gray-900 uppercase tracking-wider border-l border-gray-200 min-w-[80px] cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => toggleSort("_total")}
              >
                <div className="flex items-center justify-center gap-0.5">
                  Total{sortArrow("_total")}
                </div>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, rowIdx) => {
              const userCells = cellData[u.user_id] || {};
              const priorBal = hasPrior ? getPriorBalance(u.user_id) : 0;
              const userHasPrior = hasPrior && hasPriorData(u.user_id);

              return (
                <tr
                  key={u.user_id}
                  className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  {/* Name cell */}
                  <td
                    className={`sticky left-0 z-10 px-3 py-2 border-b border-gray-100 font-medium text-gray-900 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)] cursor-pointer hover:text-green-700 transition-colors ${
                      rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50"
                    }`}
                    onClick={() => openUserLedger(u.user_id, u.display_name)}
                  >
                    {u.display_name}
                  </td>

                  {/* Prior cell */}
                  {hasPrior && (
                    <td
                      className={`px-3 py-2 border-b border-gray-100 border-r border-gray-200 text-center ${
                        userHasPrior
                          ? "cursor-pointer hover:bg-green-50 transition-colors"
                          : ""
                      }`}
                      onClick={
                        userHasPrior
                          ? () =>
                              setPriorModal({
                                userId: u.user_id,
                                userName: u.display_name,
                              })
                          : undefined
                      }
                    >
                      {userHasPrior && (
                        <span
                          className={`text-xs font-medium ${balColor(priorBal)}`}
                        >
                          {fmtCompact(priorBal)}
                        </span>
                      )}
                    </td>
                  )}

                  {/* Active cells */}
                  {columns.map((col) => {
                    const isParticipant = participation[col.id]?.has(
                      u.user_id
                    );

                    if (!isParticipant) {
                      return (
                        <td
                          key={col.id}
                          className="px-3 py-2 border-b border-gray-100 text-center"
                        />
                      );
                    }

                    const cellVal = userCells[col.id] || 0;
                    return (
                      <td
                        key={col.id}
                        className="px-3 py-2 border-b border-gray-100 text-center cursor-pointer hover:bg-green-50 transition-colors"
                        onClick={() =>
                          openCellModal(u.user_id, col, u.display_name)
                        }
                      >
                        <span
                          className={`text-xs font-medium ${balColor(cellVal)}`}
                        >
                          {fmtCompact(cellVal)}
                        </span>
                      </td>
                    );
                  })}

                  {/* Other cell */}
                  {(() => {
                    const otherVal = userCells["_other"];
                    return (
                      <td
                        className={`px-3 py-2 border-b border-gray-100 border-l border-gray-200 text-center ${
                          otherVal
                            ? "cursor-pointer hover:bg-green-50 transition-colors"
                            : ""
                        }`}
                        onClick={
                          otherVal
                            ? () => {
                                setCellModal({
                                  userId: u.user_id,
                                  colId: "_other",
                                  userName: u.display_name,
                                  colLabel: "Other",
                                });
                                setCellTxnsLoading(true);
                                fetch(
                                  `/api/admin/financials/contest-ledger?user_id=${u.user_id}&uncategorized=1`
                                )
                                  .then((r) => r.json())
                                  .then((d) => {
                                    setCellTxns(d.transactions || []);
                                    setCellTxnsLoading(false);
                                  });
                              }
                            : undefined
                        }
                      >
                        {otherVal ? (
                          <span className={`text-xs font-medium ${balColor(otherVal)}`}>
                            {fmtCompact(otherVal)}
                          </span>
                        ) : null}
                      </td>
                    );
                  })()}

                  {/* Total cell */}
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
              {hasPrior && (() => {
                const priorTotal = Number(
                  filtered
                    .reduce((sum, u) => sum + getPriorBalance(u.user_id), 0)
                    .toFixed(2)
                );
                return (
                  <td
                    className={`px-3 py-2 text-center text-xs border-r border-gray-200 ${balColor(priorTotal)}`}
                  >
                    {priorTotal !== 0 ? fmtCompact(priorTotal) : ""}
                  </td>
                );
              })()}
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
              {/* Other footer */}
              {(() => {
                const otherTotal = Number(
                  filtered
                    .reduce((sum, u) => sum + ((cellData[u.user_id] || {})["_other"] || 0), 0)
                    .toFixed(2)
                );
                return (
                  <td className={`px-3 py-2 text-center text-xs border-l border-gray-200 ${balColor(otherTotal)}`}>
                    {otherTotal !== 0 ? fmtCompact(otherTotal) : ""}
                  </td>
                );
              })()}
              <td
                className={`px-3 py-2 text-center border-l border-gray-200 ${balColor(
                  filtered.reduce((sum, u) => sum + u.balance, 0)
                )}`}
              >
                {fmt(
                  Number(
                    filtered
                      .reduce((sum, u) => sum + u.balance, 0)
                      .toFixed(2)
                  )
                )}
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
                            {tx.source === "manual"
                              ? (tx.attributed_to || tx.created_by_name || tx.creator?.display_name || tx.source)
                              : tx.source}
                          </span>
                          {tx.has_history && (
                            <svg className="inline-block w-3 h-3 text-amber-500 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          )}
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

      {/* Prior Drill-Down Drawer */}
      {priorModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setPriorModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[60vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <h2 className="text-lg font-bold text-gray-900">
                {priorModal.userName}
              </h2>
              <p className="text-sm text-gray-500">Prior Events</p>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-4">
              {(() => {
                const events = getPriorEvents(priorModal.userId);
                if (events.length === 0) {
                  return (
                    <p className="text-sm text-gray-400 text-center py-2">
                      No prior events.
                    </p>
                  );
                }
                return (
                  <div className="space-y-0 rounded-xl overflow-hidden border border-gray-100">
                    {events.map((ev, i) => (
                      <div
                        key={ev.id}
                        className={`flex items-center justify-between px-3 py-2.5 text-sm ${
                          i % 2 === 0 ? "bg-gray-50" : "bg-white"
                        }`}
                      >
                        <span className="text-gray-700">{ev.label}</span>
                        <span
                          className={`font-semibold whitespace-nowrap ml-2 ${balColor(ev.balance)}`}
                        >
                          {fmtCompact(ev.balance)}
                        </span>
                      </div>
                    ))}
                    {/* Total row */}
                    <div className="flex items-center justify-between px-3 py-2.5 text-sm bg-gray-100 border-t border-gray-200">
                      <span className="font-semibold text-gray-600">Total</span>
                      <span
                        className={`font-bold ${balColor(
                          getPriorBalance(priorModal.userId)
                        )}`}
                      >
                        {fmtCompact(getPriorBalance(priorModal.userId))}
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* User Full Ledger Modal */}
      {userLedgerModal && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setUserLedgerModal(null)}
          />
          <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[85vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
              <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-gray-900">
                    {userLedgerModal.userName}
                  </h2>
                  <p className="text-sm text-gray-500">Full Transaction History</p>
                </div>
                <button
                  type="button"
                  onClick={() => setUserLedgerModal(null)}
                  className="text-gray-400 hover:text-gray-600 p-1"
                >
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Filters */}
              <div className="mt-3 space-y-2">
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase">From</label>
                    <input
                      type="date"
                      value={ulDateFrom}
                      onChange={(e) => setUlDateFrom(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] text-gray-500 uppercase">To</label>
                    <input
                      type="date"
                      value={ulDateTo}
                      onChange={(e) => setUlDateTo(e.target.value)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-none"
                    />
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="Search descriptions..."
                  value={ulSearch}
                  onChange={(e) => setUlSearch(e.target.value)}
                  className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-xs focus:ring-2 focus:ring-green-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-4">
              {userLedgerLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (() => {
                const totalCharges = filteredUserLedger
                  .filter((tx) => tx.type === "charge")
                  .reduce((s, tx) => s + tx.amount, 0);
                const totalPayments = filteredUserLedger
                  .filter((tx) => tx.type === "payment")
                  .reduce((s, tx) => s + tx.amount, 0);
                const netBalance = totalPayments - totalCharges;

                return (
                  <>
                    {/* Summary */}
                    <div className="flex gap-2 mb-3">
                      <div className="flex-1 bg-red-50 rounded-xl px-2 py-1.5 text-center">
                        <div className="text-xs font-bold text-red-700">{fmt(totalCharges)}</div>
                        <div className="text-[9px] text-gray-500 uppercase">Charges</div>
                      </div>
                      <div className="flex-1 bg-green-50 rounded-xl px-2 py-1.5 text-center">
                        <div className="text-xs font-bold text-green-700">{fmt(totalPayments)}</div>
                        <div className="text-[9px] text-gray-500 uppercase">Payments</div>
                      </div>
                      <div className="flex-1 bg-gray-50 rounded-xl px-2 py-1.5 text-center">
                        <div className={`text-xs font-bold ${balColor(netBalance)}`}>
                          {fmt(netBalance)}
                        </div>
                        <div className="text-[9px] text-gray-500 uppercase">Balance</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setUlSortDir((d) => d === "desc" ? "asc" : "desc")}
                      className="text-[10px] text-gray-500 mb-2 flex items-center gap-1"
                    >
                      Date {ulSortDir === "desc" ? "▼ Newest" : "▲ Oldest"} first
                    </button>

                    {filteredUserLedger.length === 0 ? (
                      <p className="text-sm text-gray-400 text-center py-4">
                        No transactions match your filters.
                      </p>
                    ) : (
                      <div className="space-y-0 rounded-xl overflow-hidden border border-gray-100">
                        {filteredUserLedger.map((tx, i) => (
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
                                  {tx.source === "manual"
                                    ? (tx.attributed_to || tx.created_by_name || tx.source)
                                    : tx.source}
                                </span>
                                {tx.has_history && (
                                  <svg className="inline-block w-3 h-3 text-amber-500 ml-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                )}
                                {tx.contest_name && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-700">
                                    {tx.contest_name}
                                  </span>
                                )}
                                {tx.trip_name && (
                                  <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700">
                                    {tx.trip_name}
                                  </span>
                                )}
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
                    <p className="text-[10px] text-gray-400 text-center mt-2">
                      {filteredUserLedger.length} transaction{filteredUserLedger.length !== 1 ? "s" : ""}
                    </p>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
