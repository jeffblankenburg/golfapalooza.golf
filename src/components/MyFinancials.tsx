"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface Transaction {
  id: string;
  trip_id: string | null;
  trip_name: string | null;
  trip_year: number | null;
  type: "charge" | "payment";
  source: "option" | "manual";
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

export default function MyFinancials({ userId }: { userId: string }) {
  void userId;
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/financials/me");
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || "Failed to load financials");
      }
      const json: FinancialData = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

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

  const { balance, transactions } = data;
  const isNegative = balance.balance < 0;

  // Group transactions by trip
  const grouped = new Map<string, { name: string; year: number | null; items: Transaction[] }>();
  for (const t of transactions) {
    const key = t.trip_id ?? "_none";
    if (!grouped.has(key)) {
      grouped.set(key, {
        name: t.trip_name ?? "Other",
        year: t.trip_year,
        items: [],
      });
    }
    grouped.get(key)!.items.push(t);
  }

  // Sort groups by year descending
  const sortedGroups = Array.from(grouped.values()).sort(
    (a, b) => (b.year ?? 0) - (a.year ?? 0)
  );

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
        <p className="text-xs text-gray-400 mt-2">
          Total charges: {formatCurrency(balance.total_charges)} | Total paid:{" "}
          {formatCurrency(balance.total_payments)}
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
                className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-medium px-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors"
              >
                Sheiker
              </Link>
              {" "}directly.
            </p>
          </div>
        );
      })()}

      {/* Transactions by Trip */}
      {sortedGroups.map((group) => (
        <div key={`${group.name}-${group.year}`}>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2 px-1">
            {group.name} {group.year ?? ""}
          </h3>
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-4">
            {group.items.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-3 py-3 border-b border-gray-100 last:border-b-0"
              >
                {/* Icon */}
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                    t.type === "charge"
                      ? "bg-red-50 text-red-500"
                      : "bg-green-50 text-green-500"
                  }`}
                >
                  {t.type === "charge" ? (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19 14l-7 7m0 0l-7-7m7 7V3"
                      />
                    </svg>
                  ) : (
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 10l7-7m0 0l7 7m-7-7v18"
                      />
                    </svg>
                  )}
                </div>

                {/* Description + date */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {t.description}
                    </p>
                    <span
                      className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${
                        t.source === "option"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {t.source === "option" ? "Auto" : "Manual"}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDate(t.created_at)}
                  </p>
                </div>

                {/* Amount */}
                <p
                  className={`text-sm font-semibold flex-shrink-0 ${
                    t.type === "charge" ? "text-red-600" : "text-green-600"
                  }`}
                >
                  {t.type === "charge" ? "-" : "+"}
                  {formatCurrency(t.amount)}
                </p>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
