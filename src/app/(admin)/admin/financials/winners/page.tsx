"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PayoutWinnersTab } from "@/components/admin/PayoutWinnersTab";

export default function FinancialWinnersPage() {
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
      <Link
        href="/admin/financials"
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Financials
      </Link>
      <h1 className="text-2xl font-bold text-gray-900">Winners</h1>
      <PayoutWinnersTab />
    </div>
  );
}
