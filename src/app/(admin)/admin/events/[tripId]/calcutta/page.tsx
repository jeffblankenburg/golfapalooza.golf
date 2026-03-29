"use client";

import { useParams } from "next/navigation";
import Link from "next/link";
import { CalcuttaManager } from "@/components/admin/CalcuttaManager";

export default function CalcuttaAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link
        href={`/admin/events/${tripId}`}
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Event
      </Link>

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Calcutta Auction</h1>
        <Link
          href="/calcutta-display"
          target="_blank"
          className="text-sm font-medium text-purple-700 bg-purple-50 px-3 py-1.5 rounded-lg hover:bg-purple-100 transition-colors"
        >
          Open Display
        </Link>
      </div>

      <CalcuttaManager tripId={tripId} />
    </div>
  );
}
