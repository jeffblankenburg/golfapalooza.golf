"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { ContestSetup } from "@/components/admin/ContestSetup";
import { ContestParticipants } from "@/components/admin/ContestParticipants";
import { RyderCupManager } from "@/components/admin/RyderCupManager";
import { KgbCupScoringManager } from "@/components/admin/KgbCupScoringManager";
import { TeeTimeManager } from "@/components/admin/TeeTimeManager";

export default function KgbCupAdminPage() {
  const params = useParams();
  const tripId = params.tripId as string;
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [contestId, setContestId] = useState<string | null>(null);
  const [dayNumber, setDayNumber] = useState<number | null>(null);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data) => {
        const user = data.user;
        if (!user) { router.replace("/admin"); return; }
        const ok = user.is_admin || user.permissions?.manage_kgb_cup === true;
        if (!ok) { router.replace(`/admin/events/${tripId}`); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router, tripId]);

  useEffect(() => {
    async function fetchContest() {
      const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
      if (res.ok) {
        const data = await res.json();
        const ryderCup = (data.contests || []).find(
          (c: { contest_type: string }) => c.contest_type === "ryder_cup"
        );
        if (ryderCup) {
          setContestId(ryderCup.id);
          setDayNumber(ryderCup.day_number || 1);
        }
      }
    }
    fetchContest();
  }, [tripId]);

  const handleReset = async () => {
    if (!contestId || !dayNumber) return;
    setResetting(true);
    try {
      const res = await fetch("/api/admin/ryder-cup/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: contestId, trip_id: tripId, day_number: dayNumber }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        alert(`Reset failed: ${data.error || "Unknown error"}`);
      }
    } catch {
      alert("Reset failed");
    } finally {
      setResetting(false);
      setShowResetModal(false);
    }
  };

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

      <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>

      <CollapsibleSection
        title="Setup"
        summary="Day & tee assignments"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        <ContestSetup contestId={contestId} contestType="ryder_cup" tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Participants"
        summary="Who's playing"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
          </svg>
        }
      >
        <ContestParticipants contestId={contestId} tripId={tripId} />
      </CollapsibleSection>

      <CollapsibleSection
        title="Teams & Pairings"
        summary="Manage teams, pairs & foursomes"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        }
      >
        <RyderCupManager tripId={tripId} />
      </CollapsibleSection>

      {dayNumber && (
        <CollapsibleSection
          title="Tee Times"
          summary="Tee times & starting holes"
          icon={
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          }
        >
          <TeeTimeManager tripId={tripId} dayNumber={dayNumber} contestType="ryder_cup" />
        </CollapsibleSection>
      )}

      <CollapsibleSection
        title="Scoring"
        summary="Handicaps, scores & results"
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
        }
      >
        <KgbCupScoringManager tripId={tripId} />
      </CollapsibleSection>

      {/* Reset KGB Cup */}
      {contestId && (
        <div className="pt-4 border-t border-gray-200">
          <button
            onClick={() => setShowResetModal(true)}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border-2 border-red-200 text-red-600 text-sm font-semibold hover:bg-red-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
            Reset KGB Cup
          </button>
        </div>
      )}

      {/* Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Reset KGB Cup?</h2>
            </div>

            <p className="text-sm text-gray-600">
              This will permanently delete all KGB Cup data:
            </p>
            <ul className="text-sm text-gray-600 list-disc list-inside space-y-1">
              <li>Teams and team assignments</li>
              <li>All pairings</li>
              <li>All foursomes</li>
              <li>All scores and handicap snapshots</li>
              <li>All tee times for KGB Cup day</li>
            </ul>
            <p className="text-sm text-red-600 font-medium">
              This cannot be undone.
            </p>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setShowResetModal(false)}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleReset}
                disabled={resetting}
                className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-50"
              >
                {resetting ? "Resetting..." : "Yes, Reset Everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
