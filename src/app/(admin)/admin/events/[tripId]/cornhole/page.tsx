"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { ContestParticipants } from "@/components/admin/ContestParticipants";
import { CornholeDoublesManager } from "@/components/admin/CornholeDoublesManager";
import { CornholeBracketManager } from "@/components/admin/CornholeBracketManager";
import { VisibilityToggle } from "@/components/admin/VisibilityToggle";
import { computeChampionId } from "@/lib/bracket/champion";
import { BTN_BACK } from "@/lib/ui/buttons";

export default function CornholeAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [singlesContestId, setSinglesContestId] = useState<string | null>(null);
  const [doublesContestId, setDoublesContestId] = useState<string | null>(null);
  const [singlesLocked, setSinglesLocked] = useState(false);
  const [doublesLocked, setDoublesLocked] = useState(false);
  const [singlesResult, setSinglesResult] = useState<string | null>(null);
  const [doublesResult, setDoublesResult] = useState<string | null>(null);
  const [singlesBracketPublishedAt, setSinglesBracketPublishedAt] = useState<string | null>(null);
  const [doublesBracketPublishedAt, setDoublesBracketPublishedAt] = useState<string | null>(null);

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
    if (singles) {
      setSinglesContestId(singles.id);
      setSinglesLocked(!!singles.winners_locked_at);
      setSinglesBracketPublishedAt(singles.bracket_published_at ?? null);
      fetchResultText(singles.id).then(setSinglesResult);
    }
    if (doubles) {
      setDoublesContestId(doubles.id);
      setDoublesLocked(!!doubles.winners_locked_at);
      setDoublesBracketPublishedAt(doubles.bracket_published_at ?? null);
      fetchResultText(doubles.id).then(setDoublesResult);
    }
  }, [tripId]);

  const fetchResultText = async (contestId: string): Promise<string | null> => {
    try {
      const res = await fetch(`/api/admin/cornhole/bracket?contest_id=${contestId}`);
      if (!res.ok) return null;
      const data = await res.json();
      const matches = data.matches || [];
      const nameMap: Record<string, { display_name: string }> = data.nameMap || {};
      const championId = computeChampionId(matches);
      if (!championId) return null;

      // Find the final match to get the runner-up
      const champMatches = matches.filter((m: { bracket_type: string }) => m.bracket_type === "championship");
      let runnerUpId: string | null = null;
      if (champMatches.length > 0) {
        const reset = champMatches.find((m: { round_number: number; winner_participant_id: string | null }) => m.round_number === 2 && m.winner_participant_id);
        const champ = champMatches.find((m: { round_number: number }) => m.round_number === 1);
        const finalMatch = reset || champ;
        if (finalMatch) {
          runnerUpId = finalMatch.slot1_participant_id === championId
            ? finalMatch.slot2_participant_id
            : finalMatch.slot1_participant_id;
        }
      } else {
        const mainMatches = matches.filter((m: { bracket_type: string }) => m.bracket_type === "main");
        const maxRound = Math.max(...mainMatches.map((m: { round_number: number }) => m.round_number));
        const finalMatch = mainMatches.find((m: { round_number: number }) => m.round_number === maxRound);
        if (finalMatch) {
          runnerUpId = finalMatch.slot1_participant_id === championId
            ? finalMatch.slot2_participant_id
            : finalMatch.slot1_participant_id;
        }
      }

      const champName = nameMap[championId]?.display_name || "Unknown";
      const runnerUpName = runnerUpId ? (nameMap[runnerUpId]?.display_name || "Unknown") : null;

      return runnerUpName
        ? `${champName} defeated ${runnerUpName}`
        : `Champion: ${champName}`;
    } catch {
      return null;
    }
  };

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
      <Link href={`/admin/events/${tripId}`} className={BTN_BACK}>
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
        key={`singles-${singlesLocked}`}
        title="Singles Bracket"
        summary={singlesResult || (singlesLocked ? "Locked" : "")}
        icon={
          singlesLocked ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          )
        }
        iconColor={singlesLocked ? "text-amber-700" : undefined}
        badge={singlesContestId && (
          <VisibilityToggle
            kind="bracket"
            contestId={singlesContestId}
            publishedAt={singlesBracketPublishedAt}
            onChanged={fetchContests}
          />
        )}
      >
        <CornholeBracketManager tripId={tripId} contestType="cornhole_singles" onChampionCrowned={fetchContests} />
      </CollapsibleSection>

      <CollapsibleSection
        key={`doubles-${doublesLocked}`}
        title="Doubles Bracket"
        summary={doublesResult || (doublesLocked ? "Locked" : "")}
        icon={
          doublesLocked ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h8m-8 6h16" />
            </svg>
          )
        }
        iconColor={doublesLocked ? "text-amber-700" : undefined}
        badge={doublesContestId && (
          <VisibilityToggle
            kind="bracket"
            contestId={doublesContestId}
            publishedAt={doublesBracketPublishedAt}
            onChanged={fetchContests}
          />
        )}
      >
        <CornholeBracketManager tripId={tripId} contestType="cornhole_doubles" onChampionCrowned={fetchContests} />
      </CollapsibleSection>
    </div>
  );
}
