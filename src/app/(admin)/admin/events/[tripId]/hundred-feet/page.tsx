"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { HundredFeetManager } from "@/components/admin/HundredFeetManager";

export default function HundredFeetAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const user = data.user;
        if (!user) { router.replace("/admin"); return; }
        const ok = user.is_admin || user.permissions?.manage_scrambles === true;
        if (!ok) { router.replace(`/admin/events/${tripId}`); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router, tripId]);

  if (allowed === null) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 pt-6 pb-12 space-y-4">
      <div className="flex items-center gap-2">
        <Link
          href={`/admin/events/${tripId}`}
          className="text-gray-400 active:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </Link>
        <h1 className="text-xl font-bold text-gray-900">100 Feet!</h1>
      </div>

      <HundredFeetManager tripId={tripId} />
    </div>
  );
}
