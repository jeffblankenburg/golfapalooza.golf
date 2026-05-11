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

interface NoWinnerRecord {
  day_number: number;
  contest_type: string;
}

// Long Putt always has a winner; CTP and LD can be declared no-winner.
const NO_WINNER_VALUE = "__no_winner__";
const NO_WINNER_TYPES = new Set(["ctp_front", "ctp_back", "long_drive"]);

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
  // Tracks contests where admin explicitly declared "no winner". Key
  // shape matches `winnerKey`. Mutually exclusive with `winners`.
  const [noWinners, setNoWinners] = useState<Set<string>>(new Set());
  const [eventDays, setEventDays] = useState<EventDay[]>([]);
  const [scrambleDayNumbers, setScrambleDayNumbers] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [ctpContestId, setCtpContestId] = useState<string | null>(null);
  const [longDriveContestId, setLongDriveContestId] = useState<string | null>(null);
  // Eligibility per (day, contest_type) → Set<user_id>. Built from the
  // per-day contests' contest_participants (issue #124). Falls back to
  // "everyone" when the corresponding contest doesn't exist or has no
  // roster yet.
  const [eligibilityByDayType, setEligibilityByDayType] = useState<Map<string, Set<string>>>(
    new Map(),
  );
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

  const fetchScrambleDays = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    type ContestRow = {
      id: string;
      name: string;
      contest_type: string;
      day_number: number | null;
    };
    const contests = (data.contests || []) as ContestRow[];

    const dayNums = [
      ...new Set(
        contests
          .filter((c) => c.contest_type === "scramble" && c.day_number != null)
          .map((c) => c.day_number as number),
      ),
    ];
    dayNums.sort((a, b) => a - b);
    setScrambleDayNumbers(dayNums);

    // Legacy umbrella contests for the participants-accordion UI.
    const ctp = contests.find((c) => c.name === "Closest to the Pin" && c.contest_type === "other");
    const ld = contests.find((c) => c.name === "Long Drive" && c.contest_type === "other");
    setCtpContestId(ctp?.id || null);
    setLongDriveContestId(ld?.id || null);

    // Issue #124: eligibility comes from per-day contests now, not the
    // umbrella. Find every per-day contest for the four daily types and
    // batch-load their participants.
    const PER_DAY_TYPES = new Set(["ctp_front", "ctp_back", "long_drive", "long_putt"]);
    const dayTypeContests = contests.filter(
      (c) => PER_DAY_TYPES.has(c.contest_type) && c.day_number != null,
    );
    const lookups = await Promise.all(
      dayTypeContests.map((c) =>
        fetch(`/api/admin/contests/participants?contest_id=${c.id}`)
          .then((r) => r.json())
          .then((d) => ({ c, participants: (d.participants || []) as { user_id: string }[] })),
      ),
    );
    const map = new Map<string, Set<string>>();
    for (const { c, participants: ps } of lookups) {
      const key = `${c.day_number}-${c.contest_type}`;
      map.set(key, new Set(ps.map((p) => p.user_id)));
    }
    setEligibilityByDayType(map);
  }, [tripId]);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/daily-winners?trip_id=${tripId}`);
    const data = await res.json();

    setParticipants(data.participants || []);

    const map: Record<string, string> = {};
    for (const w of (data.winners || []) as Winner[]) {
      map[winnerKey(w.day_number, w.contest_type)] = w.user_id;
    }
    setWinners(map);

    const nw = new Set<string>();
    for (const r of (data.no_winners || []) as NoWinnerRecord[]) {
      nw.add(winnerKey(r.day_number, r.contest_type));
    }
    setNoWinners(nw);

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
    setNoWinners((prev) => {
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
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

  const setNoWinner = async (day: number, contestType: string) => {
    const key = winnerKey(day, contestType);
    setWinners((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setNoWinners((prev) => new Set(prev).add(key));
    setSaving(key);

    try {
      await fetch("/api/admin/daily-winners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          day_number: day,
          contest_type: contestType,
          no_winner: true,
        }),
      });
    } catch {
      // Revert on error
      setNoWinners((prev) => {
        const next = new Set(prev);
        next.delete(key);
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
      setNoWinners(new Set());
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

      {/* Contest Participant Accordions — these still edit the legacy
          umbrella contests for now. Eligibility on the dropdowns below
          uses the per-day contests' participant lists (issue #124). */}
      {ctpContestId && (
        <ContestParticipantsAccordion
          tripId={tripId}
          contestName="Closest to the Pin"
          contestId={ctpContestId}
          onChanged={() => fetchScrambleDays()}
        />
      )}
      {longDriveContestId && (
        <ContestParticipantsAccordion
          tripId={tripId}
          contestName="Long Drive"
          contestId={longDriveContestId}
          onChanged={() => fetchScrambleDays()}
        />
      )}

      {DAYS.map((d) => (
        <div key={d.day} className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-900">{d.label}</p>
          {CONTEST_TYPES.map((ct) => {
            const key = winnerKey(d.day, ct.type);
            const selectedUserId = winners[key] || "";
            const isSaving = saving === key;

            // Issue #124: eligibility comes from the per-day contest's
            // contest_participants. If no per-day contest exists or its
            // roster hasn't been built yet, fall back to "everyone" so
            // the admin isn't blocked.
            const eligibleIds = eligibilityByDayType.get(`${d.day}-${ct.type}`);
            const eligible =
              eligibleIds && eligibleIds.size > 0
                ? participants.filter((p) => eligibleIds.has(p.id))
                : participants;

            const isNoWinner = noWinners.has(key);
            const canDeclareNoWinner = NO_WINNER_TYPES.has(ct.type);
            const selectValue = isNoWinner ? NO_WINNER_VALUE : selectedUserId;

            return (
              <div key={ct.type} className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-24 flex-shrink-0">
                  {ct.label}
                </label>
                <div className="relative flex-1">
                  <select
                    value={selectValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === NO_WINNER_VALUE) {
                        setNoWinner(d.day, ct.type);
                      } else if (v) {
                        setWinner(d.day, ct.type, v);
                      }
                    }}
                    disabled={isSaving}
                    className="w-full text-sm border border-gray-200 rounded-lg py-1.5 px-2 bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none disabled:opacity-50 appearance-none"
                  >
                    <option value="">Select winner...</option>
                    {canDeclareNoWinner && (
                      <option value={NO_WINNER_VALUE}>🚫 No winner (pot carries)</option>
                    )}
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
