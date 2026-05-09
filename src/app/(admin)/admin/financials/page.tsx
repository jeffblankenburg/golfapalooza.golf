"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface CardProps {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  disabled?: boolean;
  badge?: string;
}

function Card({ href, title, description, icon, disabled, badge }: CardProps) {
  const inner = (
    <div
      className={`bg-white rounded-2xl border border-gray-200 p-4 flex items-start gap-3 transition-colors ${
        disabled ? "opacity-50" : "active:bg-gray-50 hover:border-green-300"
      }`}
    >
      <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-green-50 text-green-700 flex items-center justify-center">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-gray-900">{title}</h2>
          {badge && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] uppercase tracking-wide font-medium">
              {badge}
            </span>
          )}
        </div>
        <p className="text-sm text-gray-500 mt-0.5">{description}</p>
      </div>
      <svg
        className="w-5 h-5 text-gray-300 flex-shrink-0 mt-0.5"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
  if (disabled) return <div>{inner}</div>;
  return <Link href={href}>{inner}</Link>;
}

export default function FinancialsLandingPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const user = data.user;
        if (!user) { router.replace("/admin"); return; }
        const ok = user.is_admin || user.permissions?.manage_finances === true;
        if (!ok) { router.replace("/admin"); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router]);

  if (!allowed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <h1 className="text-2xl font-bold text-gray-900">Financials</h1>

      <div className="space-y-3">
        <Card
          href="/admin/financials/users"
          title="Users &amp; Transactions"
          description="Per-Loozer charges, payments, winnings, and contest entry tracking."
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-5.13a4 4 0 11-8 0 4 4 0 018 0zm6 3a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          }
        />

        <Card
          href="/admin/financials/grid"
          title="Balances &amp; Payouts Grid"
          description="All-Loozer balances grid, Winners tracking, and the cash-denomination calculator."
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18M7 3v18M17 3v18" />
            </svg>
          }
        />

        <Card
          href="/admin/financials/payout-events"
          title="Payout Events"
          description="Configure the cash-needed sheet — which events pay out, who participates, how much per attendee."
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        />

        <Card
          href="/admin/financials/cost-items"
          title="Cost Items"
          description="Bookkeeping ledger of every line item that comprises a trip's cost — admin-only breakdown of the Trip Cost lump sum."
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />
      </div>
    </div>
  );
}
