"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { ContestParticipants } from "@/components/admin/ContestParticipants";
import { CalcuttaManager } from "@/components/admin/CalcuttaManager";
import { BTN_BACK } from "@/lib/ui/buttons";

export default function CalcuttaAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [contestId, setContestId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const user = data.user;
        if (!user) { router.replace("/admin"); return; }
        const ok = user.is_admin || user.permissions?.manage_calcutta === true;
        if (!ok) { router.replace(`/admin/events/${tripId}`); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router, tripId]);

  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const calcutta = (data.contests || []).find(
      (c: { contest_type: string }) => c.contest_type === "calcutta"
    );
    if (calcutta) setContestId(calcutta.id);
  }, [tripId]);

  useEffect(() => {
    fetchContest();
  }, [fetchContest]);

  if (!allowed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link href={`/admin/events/${tripId}`} className={BTN_BACK}>
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

      <CollapsibleSection
        title="Participants"
        summary="Who's in the auction"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        }
      >
        <ContestParticipants contestId={contestId} tripId={tripId} />
      </CollapsibleSection>

      <CalcuttaManager tripId={tripId} />
    </div>
  );
}
