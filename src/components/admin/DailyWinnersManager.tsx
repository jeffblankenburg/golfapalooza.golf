"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { ContestParticipantsAccordion } from "./ContestParticipantsAccordion";

interface Participant {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Winner {
  id: string;
  day_number: number;
  contest_type: string;
  user_id: string;
}

interface EventDay {
  day_number: number;
  name: string;
}

const CONTEST_TYPES = [
  { type: "ctp_front", label: "CTP Front 9" },
  { type: "ctp_back", label: "CTP Back 9" },
  { type: "long_drive", label: "Long Drive" },
  { type: "long_putt", label: "Long Putt" },
];

export function DailyWinnersManager({ tripId }: { tripId: string }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [eventDays, setEventDays] = useState<EventDay[]>([]);
  const [scrambleDayNumbers, setScrambleDayNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [ctpContestId, setCtpContestId] = useState<string | null>(null);
  const [longDriveContestId, setLongDriveContestId] = useState<string | null>(null);
  const [ctpParticipantIds, setCtpParticipantIds] = useState<Set<string>>(new Set());
  const [ldParticipantIds, setLdParticipantIds] = useState<Set<string>>(new Set());
  const [showRealNames, setShowRealNames] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Scramble days derived from contests, with names from event_days
  const DAYS = scrambleDayNumbers.map((dayNum) => {
    const ed = eventDays.find((d) => d.day_number === dayNum);
    return { day: dayNum, label: ed?.name || `Day ${dayNum}` };
  });

  const winnerKey = (day: number, type: string) => `${day}-${type}`;

  const fetchEventDays = useCallback(async () => {
    const res = await fetch(`/api/admin/event-days?trip_id=${tripId}`);
    const data = await res.json();
    if (data.days) setEventDays(data.days);
  }, [tripId]);

  const fetchContestParticipants = useCallback(async (cId: string | null, ldId: string | null) => {
    const fetches = await Promise.all([
      cId ? fetch(`/api/admin/contests/participants?contest_id=${cId}`).then((r) => r.json()) : Promise.resolve({ participants: [] }),
      ldId ? fetch(`/api/admin/contests/participants?contest_id=${ldId}`).then((r) => r.json()) : Promise.resolve({ participants: [] }),
    ]);
    setCtpParticipantIds(new Set<string>((fetches[0].participants || []).map((p: { user_id: string }) => p.user_id)));
    setLdParticipantIds(new Set<string>((fetches[1].participants || []).map((p: { user_id: string }) => p.user_id)));
  }, []);

  const fetchScrambleDays = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const contests = data.contests || [] as { id: string; name: string; contest_type: string; day_number: number | null }[];
    const dayNums = [
      ...new Set(
        contests
          .filter((c: { contest_type: string; day_number: number | null }) => c.contest_type === "scramble" && c.day_number != null)
          .map((c: { day_number: number }) => c.day_number)
      ),
    ] as number[];
    dayNums.sort((a, b) => a - b);
    setScrambleDayNumbers(dayNums);

    // Find CTP and Long Drive contest IDs
    const ctp = contests.find((c: { name: string; contest_type: string }) => c.name === "Closest to the Pin" && c.contest_type === "other");
    const ld = contests.find((c: { name: string; contest_type: string }) => c.name === "Long Drive" && c.contest_type === "other");
    const newCtpId = ctp?.id || null;
    const newLdId = ld?.id || null;
    setCtpContestId(newCtpId);
    setLongDriveContestId(newLdId);
    fetchContestParticipants(newCtpId, newLdId);
  }, [tripId, fetchContestParticipants]);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/daily-winners?trip_id=${tripId}`);
    const data = await res.json();

    setParticipants(data.participants || []);

    const map: Record<string, string> = {};
    for (const w of (data.winners || []) as Winner[]) {
      map[winnerKey(w.day_number, w.contest_type)] = w.user_id;
    }
    setWinners(map);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchEventDays();
    fetchScrambleDays();
    fetchData();
  }, [fetchEventDays, fetchScrambleDays, fetchData]);

  // Listen for event days changes and contests changes
  useEffect(() => {
    const handleDays = () => fetchEventDays();
    const handleContests = () => fetchScrambleDays();
    window.addEventListener("event-days-changed", handleDays);
    window.addEventListener("contests-changed", handleContests);
    return () => {
      window.removeEventListener("event-days-changed", handleDays);
      window.removeEventListener("contests-changed", handleContests);
    };
  }, [fetchEventDays, fetchScrambleDays]);

  const setWinner = async (day: number, contestType: string, userId: string) => {
    const key = winnerKey(day, contestType);
    setWinners((prev) => ({ ...prev, [key]: userId }));
    setSaving(key);

    try {
      await fetch("/api/admin/daily-winners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          day_number: day,
          contest_type: contestType,
          user_id: userId,
        }),
      });
    } catch {
      // Revert on error
      setWinners((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSaving(null);
  };

  const handleReset = async () => {
    try {
      const res = await fetch(`/api/admin/daily-winners?trip_id=${tripId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      setWinners({});
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Select winners for each day
        </p>
        <button
          onClick={() => setShowRealNames(!showRealNames)}
          className="text-xs text-gray-500 underline"
        >
          {showRealNames ? "Show nicknames" : "Show real names"}
        </button>
      </div>

      {/* Contest Participant Accordions */}
      {ctpContestId && (
        <ContestParticipantsAccordion
          tripId={tripId}
          contestName="Closest to the Pin"
          contestId={ctpContestId}
          onChanged={() => fetchContestParticipants(ctpContestId, longDriveContestId)}
        />
      )}
      {longDriveContestId && (
        <ContestParticipantsAccordion
          tripId={tripId}
          contestName="Long Drive"
          contestId={longDriveContestId}
          onChanged={() => fetchContestParticipants(ctpContestId, longDriveContestId)}
        />
      )}

      {DAYS.map((d) => (
        <div key={d.day} className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-900">{d.label}</p>
          {CONTEST_TYPES.map((ct) => {
            const key = winnerKey(d.day, ct.type);
            const selectedUserId = winners[key] || "";
            const isSaving = saving === key;

            // Filter eligible participants by contest type
            let eligible = participants;
            if ((ct.type === "ctp_front" || ct.type === "ctp_back") && ctpParticipantIds.size > 0) {
              eligible = participants.filter((p) => ctpParticipantIds.has(p.id));
            } else if (ct.type === "long_drive" && ldParticipantIds.size > 0) {
              eligible = participants.filter((p) => ldParticipantIds.has(p.id));
            }
            // long_putt: everyone is eligible

            return (
              <div key={ct.type} className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-24 flex-shrink-0">
                  {ct.label}
                </label>
                <div className="relative flex-1">
                  <select
                    value={selectedUserId}
                    onChange={(e) => {
                      if (e.target.value) {
                        setWinner(d.day, ct.type, e.target.value);
                      }
                    }}
                    disabled={isSaving}
                    className="w-full text-sm border border-gray-200 rounded-lg py-1.5 px-2 bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none disabled:opacity-50 appearance-none"
                  >
                    <option value="">Select winner...</option>
                    {eligible.map((p) => (
                      <option key={p.id} value={p.id}>
                        {showRealNames ? (p.full_name || p.display_name) : p.display_name}
                      </option>
                    ))}
                  </select>
                  <svg className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Reset */}
      <button
        onClick={() =>
          setConfirmModal({
            title: "Reset Daily Winners",
            message: "This will clear all daily game winners across all days. This cannot be undone.",
            onConfirm: handleReset,
          })
        }
        className="w-full py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
      >
        Reset All Winners
      </button>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        onConfirm={() => {
          confirmModal?.onConfirm();
          setConfirmModal(null);
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
