"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { ContestParticipants } from "@/components/admin/ContestParticipants";
import { CornholeDoublesManager } from "@/components/admin/CornholeDoublesManager";
import { CornholeBracketManager } from "@/components/admin/CornholeBracketManager";

export default function CornholeAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [singlesContestId, setSinglesContestId] = useState<string | null>(null);
  const [doublesContestId, setDoublesContestId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const user = data.user;
        if (!user) { router.replace("/admin"); return; }
        const ok = user.is_admin || user.permissions?.manage_cornhole === true;
        if (!ok) { router.replace(`/admin/events/${tripId}`); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router, tripId]);

  const fetchContests = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const contests = data.contests || [];
    const singles = contests.find((c: { contest_type: string }) => c.contest_type === "cornhole_singles");
    const doubles = contests.find((c: { contest_type: string }) => c.contest_type === "cornhole_doubles");
    if (singles) setSinglesContestId(singles.id);
    if (doubles) setDoublesContestId(doubles.id);
  }, [tripId]);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

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
        href={`/admin/events/${tripId}`}
        className="flex items-center gap-1 text-green-700 text-sm font-medium"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Back to Event
      </Link>

      <h1 className="text-2xl font-bold text-gray-900">Cornhole</h1>

      {singlesContestId && (
        <CollapsibleSection
          title="Singles Participants"
          summary="Who's playing singles"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        >
          <ContestParticipants contestId={singlesContestId} tripId={tripId} />
        </CollapsibleSection>
      )}

      {doublesContestId && (
        <CollapsibleSection
          title="Doubles Participants"
          summary="Who's playing doubles"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          }
        >
          <ContestParticipants contestId={doublesContestId} tripId={tripId} />
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Doubles Teams"
        summary="Manage partner pairs"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
      >
        <CornholeDoublesManager tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Singles Bracket"
        summary="Single elimination"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
          </svg>
        }
      >
        <CornholeBracketManager tripId={tripId} contestType="cornhole_singles" />
      </CollapsibleSection>

      <CollapsibleSection
        title="Doubles Bracket"
        summary="Double elimination"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
          </svg>
        }
      >
        <CornholeBracketManager tripId={tripId} contestType="cornhole_doubles" />
      </CollapsibleSection>
    </div>
  );
}
