"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";
import { PayoutDenominationsTab } from "./PayoutDenominationsTab";
import { PayoutWinnersTab } from "./PayoutWinnersTab";

// ── Types ──────────────────────────────────────────────────────────────

interface GridUser {
  user_id: string;
  display_name: string;
  total_charges: number;
  total_payments: number;
  balance: number;
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

interface ActiveTrip {
  id: string;
  trip_name: string;
  trip_year: number;
}

type TabKey = "all" | "current" | "denominations" | "winners";
type SortKey = "_name" | "_charges" | "_payments" | "_total";

// ── Helpers ────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

const balColor = (n: number) =>
  n < 0 ? "text-red-600" : n > 0 ? "text-green-600" : "text-gray-500";

// ── Component ─────────────────────────────────────────────────────────

export function FinancialGrid() {
  const [users, setUsers] = useState<GridUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortCol, setSortCol] = useState<SortKey>("_name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const [activeTrip, setActiveTrip] = useState<ActiveTrip | null>(null);
  const [activeAttending, setActiveAttending] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>("all");

  // Full user ledger drill-down
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
    setUsers(
      (data.users || []).map((u: GridUser) => ({
        user_id: u.user_id,
        display_name: u.display_name,
        total_charges: u.total_charges || 0,
        total_payments: u.total_payments || 0,
        balance: u.balance || 0,
      }))
    );
    setActiveTrip(data.active_trip || null);
    setActiveAttending(new Set<string>(data.active_trip_attending || []));
  }, []);

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

  // ── Filter + sort ──────────────────────────────────────────────────

  const tabScopedUsers =
    tab === "current"
      ? users.filter((u) => activeAttending.has(u.user_id))
      : users;

  const filtered = (
    search
      ? tabScopedUsers.filter((u) =>
          u.display_name.toLowerCase().includes(search.toLowerCase())
        )
      : tabScopedUsers
  )
    .slice()
    .sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortCol) {
        case "_name":
          return a.display_name.localeCompare(b.display_name) * dir;
        case "_charges":
          return (a.total_charges - b.total_charges) * dir;
        case "_payments":
          return (a.total_payments - b.total_payments) * dir;
        case "_total":
          return (a.balance - b.balance) * dir;
      }
    });

  const totals = filtered.reduce(
    (acc, u) => ({
      charges: acc.charges + u.total_charges,
      payments: acc.payments + u.total_payments,
      balance: acc.balance + u.balance,
    }),
    { charges: 0, payments: 0, balance: 0 }
  );

  const toggleSort = (col: SortKey) => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir(col === "_name" ? "asc" : "desc");
    }
  };

  const sortArrow = (col: SortKey) =>
    sortCol === col ? (
      <span className="text-green-600">{sortDir === "desc" ? " ▼" : " ▲"}</span>
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

  // ── Render ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Link
        href="/admin/financials"
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Financials
      </Link>

      {/* Tabs */}
      {activeTrip && (
        <div className="border-b border-gray-200 -mx-4 px-2 overflow-x-auto">
          <div className="flex gap-0.5 min-w-max">
            {([
              { key: "all" as const, label: "All Events" },
              { key: "current" as const, label: activeTrip.trip_name },
              { key: "winners" as const, label: "Winners" },
              { key: "denominations" as const, label: "Payout Denominations" },
            ]).map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                className={`px-3 py-2 text-sm font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  tab === t.key
                    ? "text-green-700 border-green-600"
                    : "text-gray-400 border-transparent active:text-gray-600"
                }`}
              >
                {t.label}
                {t.key === "current" && (
                  <span className="ml-1.5 text-[11px] font-normal text-gray-400">
                    ({activeAttending.size} attending)
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "denominations" ? (
        <PayoutDenominationsTab />
      ) : tab === "winners" ? (
        <PayoutWinnersTab />
      ) : (
        <>
      <input
        type="text"
        placeholder="Search Loozers..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
      />

      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="bg-gray-50">
              <th
                className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => toggleSort("_name")}
              >
                <span className="inline-flex items-center">Loozer{sortArrow("_name")}</span>
              </th>
              <th
                className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => toggleSort("_charges")}
              >
                <span className="inline-flex items-center">Costs{sortArrow("_charges")}</span>
              </th>
              <th
                className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => toggleSort("_payments")}
              >
                <span className="inline-flex items-center">Payments{sortArrow("_payments")}</span>
              </th>
              <th
                className="px-3 py-2 text-right text-xs font-semibold text-gray-900 uppercase tracking-wider border-l border-gray-200 cursor-pointer select-none hover:bg-gray-100 transition-colors"
                onClick={() => toggleSort("_total")}
              >
                <span className="inline-flex items-center">Total{sortArrow("_total")}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((u, rowIdx) => (
              <tr
                key={u.user_id}
                className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                <td
                  className="px-3 py-2 border-b border-gray-100 font-medium text-gray-900 cursor-pointer hover:text-green-700 transition-colors"
                  onClick={() => openUserLedger(u.user_id, u.display_name)}
                >
                  {u.display_name}
                </td>
                <td className="px-3 py-2 border-b border-gray-100 text-right text-red-600 tabular-nums">
                  {u.total_charges ? fmt(u.total_charges) : ""}
                </td>
                <td className="px-3 py-2 border-b border-gray-100 text-right text-green-600 tabular-nums">
                  {u.total_payments ? fmt(u.total_payments) : ""}
                </td>
                <td
                  className={`px-3 py-2 border-b border-gray-100 border-l border-gray-200 text-right font-bold tabular-nums ${balColor(u.balance)}`}
                >
                  {fmt(u.balance)}
                </td>
              </tr>
            ))}

            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-sm text-gray-400">
                  No Loozers match this view.
                </td>
              </tr>
            )}

            <tr className="bg-gray-50 font-semibold border-t border-gray-200">
              <td className="px-3 py-2 text-xs text-gray-600 uppercase tracking-wider">Totals</td>
              <td className="px-3 py-2 text-right text-red-700 tabular-nums">
                {totals.charges ? fmt(Number(totals.charges.toFixed(2))) : ""}
              </td>
              <td className="px-3 py-2 text-right text-green-700 tabular-nums">
                {totals.payments ? fmt(Number(totals.payments.toFixed(2))) : ""}
              </td>
              <td
                className={`px-3 py-2 text-right border-l border-gray-200 tabular-nums ${balColor(
                  totals.balance
                )}`}
              >
                {fmt(Number(totals.balance.toFixed(2)))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
        </>
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
                  <h2 className="text-lg font-bold text-gray-900">{userLedgerModal.userName}</h2>
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
                        <div className={`text-xs font-bold ${balColor(netBalance)}`}>{fmt(netBalance)}</div>
                        <div className="text-[9px] text-gray-500 uppercase">Balance</div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setUlSortDir((d) => (d === "desc" ? "asc" : "desc"))}
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
                              <div className="text-gray-700 truncate">{tx.description}</div>
                            </div>
                            <span
                              className={`font-semibold whitespace-nowrap ml-2 ${
                                tx.type === "charge" ? "text-red-600" : "text-green-600"
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
