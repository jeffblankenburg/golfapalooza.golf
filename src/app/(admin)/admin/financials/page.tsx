"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FinancialContestsDashboard } from "@/components/admin/FinancialContestsDashboard";

export default function FinancialsAdminPage() {
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
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Financials</h1>
        <Link
          href="/admin/financials/grid"
          className="flex items-center gap-1.5 text-green-700 text-sm font-medium active:opacity-70"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M3 14h18M3 6h18M3 18h18M7 3v18M17 3v18" />
          </svg>
          Grid
        </Link>
      </div>
      <FinancialContestsDashboard />
    </div>
  );
}
