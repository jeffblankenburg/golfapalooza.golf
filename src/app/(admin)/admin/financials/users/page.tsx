"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { FinancialContestsDashboard } from "@/components/admin/FinancialContestsDashboard";
import { BTN_BACK } from "@/lib/ui/buttons";

export default function FinancialsUsersPage() {
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
      <Link href="/admin/financials" className={BTN_BACK}>← Financials</Link>
      <h1 className="text-2xl font-bold text-gray-900">Users &amp; Transactions</h1>
      <FinancialContestsDashboard />
    </div>
  );
}
