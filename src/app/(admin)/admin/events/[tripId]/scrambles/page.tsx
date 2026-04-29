"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { VisibilityToggle } from "@/components/admin/VisibilityToggle";
import { ContestSetup } from "@/components/admin/ContestSetup";
import { ContestParticipants } from "@/components/admin/ContestParticipants";
import { ScrambleManager } from "@/components/admin/ScrambleManager";
import { ScoringManager } from "@/components/admin/ScoringManager";
import { BspitwPlayoff } from "@/components/admin/BspitwPlayoff";
import { TeeTimeManager } from "@/components/admin/TeeTimeManager";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface ScrambleContest {
  id: string;
  name: string;
  day_number: number | null;
  verified_at: string | null;
  winners_locked_at: string | null;
  tee_sheet_published_at: string | null;
}

export default function ScramblesAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [scrambleContests, setScrambleContests] = useState<ScrambleContest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [scoringResults, setScoringResults] = useState<Record<string, string>>({});
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

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

  const fetchContests = useCallback(async () => {
    const [contestsRes, summaryRes] = await Promise.all([
      fetch(`/api/admin/contests?trip_id=${tripId}`),
      fetch(`/api/admin/events/${tripId}/summary`),
    ]);
    const contestsData = await contestsRes.json();
    const summaryData = await summaryRes.json();

    if (summaryData.trip?.start_date) {
      setStartDate(summaryData.trip.start_date);
    }

    const scrambles = (contestsData.contests || [])
      .filter((c: { contest_type: string }) => c.contest_type === "scramble")
      .sort((a: ScrambleContest, b: ScrambleContest) => (a.day_number || 0) - (b.day_number || 0));
    setScrambleContests(scrambles);
    if (scrambles.length > 0 && !selectedContestId) {
      setSelectedContestId(scrambles[0].id);
    }

    // Fetch leaderboard results for verified contests
    const results: Record<string, string> = {};
    for (const c of scrambles) {
      if (c.verified_at) {
        try {
          const lbRes = await fetch(`/api/scoring/leaderboard?contest_id=${c.id}`);
          if (lbRes.ok) {
            const lbData = await lbRes.json();
            const teams = lbData.leaderboard || [];
            if (teams.length >= 1) {
              const winner = teams[0];
              const relPar = winner.rel_par;
              const scoreStr = relPar === 0 ? "E" : relPar > 0 ? `+${relPar}` : `${relPar}`;
              results[c.id] = `${winner.members.join(", ")} (${scoreStr})`;
            }
          }
        } catch { /* silent */ }
      }
    }
    setScoringResults(results);
  }, [tripId, selectedContestId]);

  useEffect(() => {
    fetchContests();
  }, [fetchContests]);

  const getWeekdayLabel = (dayNumber: number | null) => {
    if (!startDate || dayNumber === null) return "Unknown";
    const [y, m, d] = startDate.split("-").map(Number);
    const date = new Date(y, m - 1, d + dayNumber - 1);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const handleReset = async () => {
    setResetting(true);
    await fetch("/api/admin/scrambles/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId }),
    });
    setResetting(false);
    window.location.reload();
  };

  if (!allowed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const selectedContest = scrambleContests.find((c) => c.id === selectedContestId);

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

      <h1 className="text-2xl font-bold text-gray-900">Scrambles</h1>

      {/* Day tabs */}
      {scrambleContests.length > 1 && (
        <div className="flex rounded-xl bg-gray-100 p-1">
          {scrambleContests.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedContestId(c.id)}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                selectedContestId === c.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500"
              }`}
            >
              <span className="flex items-center justify-center gap-1">
                {c.verified_at && (
                  <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                )}
                {getWeekdayLabel(c.day_number)}
              </span>
            </button>
          ))}
        </div>
      )}

      {selectedContest && (
        <>
          <CollapsibleSection
            title="Setup"
            summary={`${getWeekdayLabel(selectedContest.day_number)} — day & tees`}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            }
          >
            <ContestSetup contestId={selectedContestId} contestType="scramble" tripId={tripId} />
          </CollapsibleSection>

          <CollapsibleSection
            title="Participants"
            summary={`${getWeekdayLabel(selectedContest.day_number)} — who's playing`}
            icon={
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
            }
          >
            <ContestParticipants contestId={selectedContestId} tripId={tripId} />
          </CollapsibleSection>
        </>
      )}

      <CollapsibleSection
        title="Teams"
        summary="Manage teams"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
        }
        badge={selectedContest && (
          <VisibilityToggle
            contestId={selectedContest.id}
            publishedAt={selectedContest.tee_sheet_published_at}
            onChanged={fetchContests}
          />
        )}
      >
        <ScrambleManager tripId={tripId} contestId={selectedContestId} />
      </CollapsibleSection>

      {selectedContest?.day_number && (
        <CollapsibleSection
          title="Tee Times"
          summary={`${getWeekdayLabel(selectedContest.day_number)} — tee times & starting holes`}
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <TeeTimeManager key={`tee-${selectedContest.id}`} tripId={tripId} dayNumber={selectedContest.day_number} contestType="scramble" />
        </CollapsibleSection>
      )}

      <CollapsibleSection
        key={`scoring-${selectedContest?.verified_at || "open"}`}
        title="Scoring"
        summary={
          selectedContest && scoringResults[selectedContest.id]
            ? scoringResults[selectedContest.id]
            : selectedContest?.verified_at
            ? "Locked"
            : "Hole-by-hole scores & BSPITW"
        }
        icon={
          selectedContest?.verified_at ? (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )
        }
        iconColor={selectedContest?.verified_at ? "text-amber-700" : undefined}
      >
        <ScoringManager tripId={tripId} contestId={selectedContestId} onVerified={fetchContests} />
      </CollapsibleSection>

      {/* BSPITW Playoff — only on last day when all scrambles are verified */}
      {selectedContest &&
        scrambleContests.every((c) => c.verified_at) &&
        selectedContest.id === scrambleContests[scrambleContests.length - 1]?.id && (
        <CollapsibleSection
          title="BSPITW Playoff"
          summary="Tiebreaker"
          defaultOpen
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
            </svg>
          }
          iconColor="text-amber-600"
        >
          <BspitwPlayoff tripId={tripId} onResolved={fetchContests} />
        </CollapsibleSection>
      )}

      {/* Reset all scrambles */}
      <button
        onClick={() =>
          setConfirmModal({
            title: "Reset All Scrambles",
            message: "This will permanently delete ALL scramble tee assignments, participants, teams, team members, and scores across all days. This cannot be undone.",
            onConfirm: async () => {
              setConfirmModal(null);
              await handleReset();
            },
          })
        }
        disabled={resetting}
        className="w-full py-3 text-sm font-medium text-red-600 border border-red-200 rounded-2xl active:bg-red-50 transition-colors"
      >
        {resetting ? "Resetting..." : "Reset All Scrambles"}
      </button>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        onConfirm={confirmModal?.onConfirm || (() => {})}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
