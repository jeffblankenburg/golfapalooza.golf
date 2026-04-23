"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import Link from "next/link";

type TransactionSource =
  | "option"
  | "manual"
  | "adjustment"
  | "contest_entry"
  | "deposit"
  | "withdrawal"
  | "winnings"
  | "credit"
  | "expense";

interface Transaction {
  id: string;
  trip_id: string | null;
  trip_name: string | null;
  trip_year: number | null;
  financial_contest_id: string | null;
  contest_name: string | null;
  type: "charge" | "payment";
  source: TransactionSource;
  description: string;
  amount: number;
  method: string | null;
  notes: string | null;
  created_at: string;
}

interface FinancialData {
  balance: {
    total_charges: number;
    total_payments: number;
    balance: number;
  };
  transactions: Transaction[];
}

// Category label + color for each source. `option` intentionally omitted — the
// description ("Breakfast", "Green fees", etc.) already tells you what it is.
// `manual` is also omitted: legacy `manual` payments are treated as deposits
// via effectiveSource() below; manual charges render without a pill.
const CATEGORY: Partial<Record<TransactionSource, { label: string; className: string }>> = {
  deposit:        { label: "Deposit",    className: "bg-green-100 text-green-800" },
  withdrawal:     { label: "Withdrawal", className: "bg-rose-100 text-rose-800" },
  winnings:       { label: "Winnings",   className: "bg-emerald-100 text-emerald-800" },
  credit:         { label: "Credit",     className: "bg-sky-100 text-sky-800" },
  expense:        { label: "Expense",    className: "bg-amber-100 text-amber-800" },
  contest_entry:  { label: "Entry",      className: "bg-violet-100 text-violet-800" },
  adjustment:     { label: "Adjustment", className: "bg-gray-100 text-gray-700" },
};

function effectiveSource(t: Transaction): TransactionSource {
  if (t.source === "manual" && t.type === "payment") return "deposit";
  return t.source;
}

const DATE_RANGES = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "ytd", label: "This year" },
] as const;
type DateRangeValue = (typeof DATE_RANGES)[number]["value"];

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Math.abs(amount));
}

function startOfRange(range: DateRangeValue): Date | null {
  const now = new Date();
  if (range === "all") return null;
  if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    return d;
  }
  if (range === "90d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    return d;
  }
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
  return null;
}

export default function MyFinancials({ userId }: { userId: string }) {
  void userId;
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sheikerAvatar, setSheikerAvatar] = useState<string | null>(null);

  // Filter state
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRangeValue>("all");
  const [activeSources, setActiveSources] = useState<Set<TransactionSource>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [res, profileRes] = await Promise.all([
        fetch("/api/financials/me"),
        fetch("/api/loozers/eeaee876-c596-4cc7-91c3-e96b63ecad0c"),
      ]);
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to load financials");
      }
      const json: FinancialData = await res.json();
      setData(json);
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setSheikerAvatar(profileData.profile?.avatar_url || null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Sources actually present in the user's transactions — only show pills for these
  const availableSources = useMemo<TransactionSource[]>(() => {
    if (!data) return [];
    const seen = new Set<TransactionSource>();
    for (const t of data.transactions) {
      const src = effectiveSource(t);
      if (CATEGORY[src]) seen.add(src);
    }
    // Preserve the display order defined in CATEGORY
    return (Object.keys(CATEGORY) as TransactionSource[]).filter((s) => seen.has(s));
  }, [data]);

  // Filter transactions against all three filter controls
  const filtered = useMemo(() => {
    if (!data) return [];
    const rangeStart = startOfRange(dateRange);
    const searchLower = search.trim().toLowerCase();
    return data.transactions.filter((t) => {
      if (rangeStart && new Date(t.created_at) < rangeStart) return false;
      if (activeSources.size > 0 && !activeSources.has(effectiveSource(t))) return false;
      if (searchLower) {
        const hay = `${t.description} ${t.notes ?? ""}`.toLowerCase();
        if (!hay.includes(searchLower)) return false;
      }
      return true;
    });
  }, [data, dateRange, search, activeSources]);

  const toggleSource = (source: TransactionSource) => {
    setActiveSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) next.delete(source);
      else next.add(source);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch("");
    setDateRange("all");
    setActiveSources(new Set());
  };

  const filtersActive = search !== "" || dateRange !== "all" || activeSources.size > 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-red-600">
        <p>{error}</p>
      </div>
    );
  }

  if (!data || data.transactions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>No financial activity yet.</p>
      </div>
    );
  }

  const { balance } = data;
  const isNegative = balance.balance < 0;

  return (
    <div className="space-y-6">
      {/* Balance Card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm text-gray-500 mb-1">
          {isNegative ? "Balance Due" : balance.balance > 0 ? "You have a credit" : "All settled up"}
        </p>
        <p
          className={`text-3xl font-bold ${
            isNegative ? "text-red-700" : balance.balance > 0 ? "text-green-700" : "text-gray-900"
          }`}
        >
          {isNegative ? "-" : ""}
          {formatCurrency(balance.balance)}
        </p>
      </div>

      {/* Venmo Payment Button */}
      {isNegative && (() => {
        const amountOwed = Math.abs(balance.balance).toFixed(2);
        const venmoDeepLink = `venmo://paycharge?txn=pay&recipients=michael-long-194&amount=${amountOwed}&note=${encodeURIComponent("Golfapalooza")}`;
        const venmoWebLink = `https://venmo.com/michael-long-194?txn=pay&amount=${amountOwed}&note=${encodeURIComponent("Golfapalooza")}`;
        return (
          <div className="space-y-2">
            <a
              href={venmoDeepLink}
              onClick={() => {
                setTimeout(() => { window.open(venmoWebLink, "_blank"); }, 500);
              }}
              className="relative flex items-center justify-center gap-2 w-full py-3.5 rounded-2xl bg-[#008CFF] text-white font-bold tracking-wide active:bg-[#0074D4] transition-colors overflow-hidden"
            >
              <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "shimmer 2.5s ease-in-out infinite" }} />
              <img src="/Venmo.png" alt="Venmo" className="w-8 h-8 object-contain relative" />
              <span className="relative">Pay Sheiker ${amountOwed}</span>
            </a>
            <p className="text-xs text-gray-400 text-center">
              For other payment options, please contact{" "}
              <Link
                href="/loozers/eeaee876-c596-4cc7-91c3-e96b63ecad0c"
                className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-medium pl-0.5 pr-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors align-middle"
              >
                {sheikerAvatar ? (
                  <img src={sheikerAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-green-700 text-white text-[8px] font-bold flex items-center justify-center">S</span>
                )}
                Sheiker
              </Link>
              {" "}directly.
            </p>
          </div>
        );
      })()}

      {/* Filters */}
      <div className="space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M10 18a8 8 0 100-16 8 8 0 000 16z" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search transactions"
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
            />
          </div>
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRangeValue)}
            className="px-3 py-2 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
          >
            {DATE_RANGES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>

        {availableSources.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {availableSources.map((src) => {
              const cat = CATEGORY[src]!;
              const active = activeSources.has(src);
              return (
                <button
                  key={src}
                  onClick={() => toggleSource(src)}
                  className={`flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                    active
                      ? cat.className
                      : "bg-white text-gray-400 border border-gray-200"
                  }`}
                >
                  {cat.label}
                </button>
              );
            })}
            {filtersActive && (
              <button
                onClick={clearFilters}
                className="flex-shrink-0 px-2.5 py-1 text-xs font-medium text-gray-500 underline underline-offset-2"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Transactions */}
      {filtered.length === 0 ? (
        <div className="text-center py-8 text-sm text-gray-400">
          No transactions match your filters.
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4">
          {filtered.map((t) => {
            const cat = CATEGORY[effectiveSource(t)];
            return (
              <div
                key={t.id}
                className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.description}
                    </p>
                    {cat && (
                      <span
                        className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${cat.className}`}
                      >
                        {cat.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                    <p className="text-xs text-gray-400">
                      {formatDate(t.created_at)}
                    </p>
                    {t.contest_name && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 bg-purple-100 text-purple-700">
                        {t.contest_name}
                      </span>
                    )}
                    {t.trip_name && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 bg-amber-100 text-amber-800">
                        {t.trip_name}{t.trip_year ? ` ${t.trip_year}` : ""}
                      </span>
                    )}
                  </div>
                  {t.notes && (
                    <p className="text-xs text-gray-500 mt-1 italic whitespace-pre-wrap break-words">
                      {t.notes}
                    </p>
                  )}
                </div>

                <p
                  className={`text-sm font-semibold flex-shrink-0 ${
                    t.type === "charge" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {t.type === "charge" ? "-" : "+"}
                  {formatCurrency(t.amount)}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
