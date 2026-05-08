"use client";

import { useState, useEffect, useCallback } from "react";
import { BracketView, BracketMatchData } from "@/components/BracketView";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { computeChampionId } from "@/lib/bracket/champion";

type BracketFormat =
  | "double-elimination"
  | "single-elim-finals-bo3"
  | "single-elim-all-bo3"
  | "single-elim-semis-bo3";

const DOUBLES_FORMAT_OPTIONS: { value: BracketFormat; label: string; description: string }[] = [
  {
    value: "double-elimination",
    label: "Double elimination",
    description: "Winners + losers brackets, championship match. Single games throughout.",
  },
  {
    value: "single-elim-finals-bo3",
    label: "Single elim · finals best-of-3",
    description: "One bracket. Lose once, you're out. Final match is best-of-3.",
  },
  {
    value: "single-elim-all-bo3",
    label: "Single elim · every match best-of-3",
    description: "One bracket. Every round is a best-of-3 series.",
  },
  {
    value: "single-elim-semis-bo3",
    label: "Single elim · semis & finals best-of-3",
    description: "One bracket. Single games until the semifinals, then best-of-3.",
  },
];

export function CornholeBracketManager({
  tripId,
  contestType,
  onChampionCrowned,
}: {
  tripId: string;
  contestType: "cornhole_singles" | "cornhole_doubles";
  onChampionCrowned?: () => void;
}) {
  const [contestId, setContestId] = useState<string | null>(null);
  const [matches, setMatches] = useState<BracketMatchData[]>([]);
  const [nameMap, setNameMap] = useState<Record<string, { display_name: string; full_name: string | null }>>({});
  const [participantCount, setParticipantCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showRealNames, setShowRealNames] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
  } | null>(null);
  const [locked, setLocked] = useState(false);
  const [bracketFormat, setBracketFormat] = useState<BracketFormat>("double-elimination");

  const isSingles = contestType === "cornhole_singles";

  // Fetch contest ID + lock status + persisted format
  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const c = (data.contests || []).find(
      (c: { contest_type: string }) => c.contest_type === contestType
    );
    setContestId(c?.id || null);
    setLocked(!!c?.winners_locked_at);
    if (c?.bracket_format) {
      setBracketFormat(c.bracket_format as BracketFormat);
    }
    return c?.id || null;
  }, [tripId, contestType]);

  // Fetch bracket data
  const fetchBracket = useCallback(async (cId: string) => {
    const res = await fetch(`/api/admin/cornhole/bracket?contest_id=${cId}`);
    const data = await res.json();
    setMatches(data.matches || []);
    setNameMap(data.nameMap || {});
  }, []);

  // Fetch participant count
  const fetchParticipantCount = useCallback(async (cId: string) => {
    if (isSingles) {
      const res = await fetch(`/api/admin/contests/participants?contest_id=${cId}`);
      const data = await res.json();
      setParticipantCount((data.participants || []).length);
    } else {
      const res = await fetch(`/api/admin/cornhole?contest_id=${cId}`);
      const data = await res.json();
      setParticipantCount((data.teams || []).length);
    }
  }, [isSingles]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const cId = await fetchContest();
      if (cId) {
        await Promise.all([fetchBracket(cId), fetchParticipantCount(cId)]);
      }
      setLoading(false);
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchContest, fetchBracket, fetchParticipantCount]);


  // Generate bracket (random seeding handled server-side)
  const handleGenerate = async () => {
    if (!contestId) return;
    setSaving("generate");
    const res = await fetch("/api/admin/cornhole/bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: contestId,
        // Singles ignores this server-side; harmless to send.
        bracket_format: isSingles ? undefined : bracketFormat,
      }),
    });
    if (res.ok) {
      await fetchBracket(contestId);
    }
    setSaving(null);
  };

  // Reset bracket
  const handleReset = () => {
    setConfirmModal({
      title: "Reset Bracket",
      message: "This will delete the entire bracket. You can regenerate it afterwards.",
      confirmLabel: "Reset",
      destructive: true,
      onConfirm: async () => {
        setConfirmModal(null);
        if (!contestId) return;
        setSaving("reset");
        await fetch(`/api/admin/cornhole/bracket?contest_id=${contestId}`, {
          method: "DELETE",
        });
        setMatches([]);
        setSaving(null);
      },
    });
  };

  // Cascade clear a match and its downstream state (shared by un-advance,
  // switch-winner, and series reset).
  const cascadeClear = (
    byId: Map<string, BracketMatchData>,
    match: BracketMatchData,
    depth: number = 0
  ) => {
    if (depth > 20) return;
    if (match.next_winner_match_id) {
      const next = byId.get(match.next_winner_match_id);
      if (next?.winner_participant_id) cascadeClear(byId, next, depth + 1);
    }
    if (match.next_loser_match_id) {
      const next = byId.get(match.next_loser_match_id);
      if (next?.winner_participant_id) cascadeClear(byId, next, depth + 1);
    }
    match.winner_participant_id = null;
    match.slot1_wins = 0;
    match.slot2_wins = 0;
    if (match.next_winner_match_id && match.next_winner_slot) {
      const next = byId.get(match.next_winner_match_id);
      if (next) {
        if (match.next_winner_slot === 1) next.slot1_participant_id = null;
        else next.slot2_participant_id = null;
        next.slot1_wins = 0;
        next.slot2_wins = 0;
      }
    }
    if (match.next_loser_match_id && match.next_loser_slot) {
      const next = byId.get(match.next_loser_match_id);
      if (next) {
        if (match.next_loser_slot === 1) next.slot1_participant_id = null;
        else next.slot2_participant_id = null;
        next.slot1_wins = 0;
        next.slot2_wins = 0;
      }
    }
    if (match.next_loser_match_id && !match.next_loser_slot) {
      const reset = byId.get(match.next_loser_match_id);
      if (reset) {
        if (reset.winner_participant_id) cascadeClear(byId, reset, depth + 1);
        reset.slot1_participant_id = null;
        reset.slot2_participant_id = null;
        reset.winner_participant_id = null;
        reset.slot1_wins = 0;
        reset.slot2_wins = 0;
      }
    }
  };

  // Apply advance/un-advance optimistically to local matches state
  const applyOptimistic = (
    prev: BracketMatchData[],
    matchId: string,
    participantId: string
  ): BracketMatchData[] => {
    const byId = new Map(prev.map((m) => [m.id, { ...m }]));
    const match = byId.get(matchId);
    if (!match) return prev;

    // Series-match branch: tally game wins, advance only when threshold hit.
    if (match.series_best_of) {
      const winsNeeded = Math.ceil(match.series_best_of / 2);
      const isWinner = match.winner_participant_id === participantId;

      if (isWinner) {
        cascadeClear(byId, match);
        match.slot1_wins = 0;
        match.slot2_wins = 0;
        return Array.from(byId.values());
      }

      if (match.winner_participant_id) {
        // Click on loser in a decided series — server rejects; no-op client-side.
        return prev;
      }

      const isSlot1 = participantId === match.slot1_participant_id;
      const newSlot1 = (match.slot1_wins ?? 0) + (isSlot1 ? 1 : 0);
      const newSlot2 = (match.slot2_wins ?? 0) + (isSlot1 ? 0 : 1);
      match.slot1_wins = newSlot1;
      match.slot2_wins = newSlot2;

      const seriesWon = newSlot1 >= winsNeeded || newSlot2 >= winsNeeded;
      if (!seriesWon) return Array.from(byId.values());

      // Series won — cascade the winner forward like a normal advance.
      const winnerId = participantId;
      const loserId = isSlot1
        ? match.slot2_participant_id
        : match.slot1_participant_id;
      match.winner_participant_id = winnerId;

      if (match.next_winner_match_id && match.next_winner_slot) {
        const next = byId.get(match.next_winner_match_id);
        if (next) {
          if (match.next_winner_slot === 1) next.slot1_participant_id = winnerId;
          else next.slot2_participant_id = winnerId;
        }
      }
      if (match.next_loser_match_id && match.next_loser_slot && loserId) {
        const next = byId.get(match.next_loser_match_id);
        if (next) {
          if (match.next_loser_slot === 1) next.slot1_participant_id = loserId;
          else next.slot2_participant_id = loserId;
        }
      }
      return Array.from(byId.values());
    }

    const isUnadvance = match.winner_participant_id === participantId;

    if (isUnadvance) {
      cascadeClear(byId, match);
    } else {
      if (match.winner_participant_id) cascadeClear(byId, match);

      // Advance: set winner and place in downstream slots
      const winnerId = participantId;
      const loserId =
        match.slot1_participant_id === winnerId
          ? match.slot2_participant_id
          : match.slot1_participant_id;

      match.winner_participant_id = winnerId;

      if (match.next_winner_match_id && match.next_winner_slot) {
        const next = byId.get(match.next_winner_match_id);
        if (next) {
          if (match.next_winner_slot === 1) next.slot1_participant_id = winnerId;
          else next.slot2_participant_id = winnerId;
        }
      }
      if (match.next_loser_match_id && match.next_loser_slot && loserId) {
        const next = byId.get(match.next_loser_match_id);
        if (next) {
          if (match.next_loser_slot === 1) next.slot1_participant_id = loserId;
          else next.slot2_participant_id = loserId;
        }
      }

      // Championship special case: LB champion (slot2) wins → populate reset with both players
      if (
        match.bracket_type === "championship" &&
        match.round_number === 1 &&
        match.next_loser_match_id &&
        !match.next_loser_slot
      ) {
        if (winnerId === match.slot2_participant_id) {
          const reset = byId.get(match.next_loser_match_id);
          if (reset) {
            reset.slot1_participant_id = match.slot1_participant_id;
            reset.slot2_participant_id = match.slot2_participant_id;
          }
        }
      }
    }

    return Array.from(byId.values());
  };

  // Unlock the bracket: clears winners and removes lock server-side
  const handleUnlock = async () => {
    if (!contestId) return;
    setConfirmModal(null);
    try {
      await fetch("/api/admin/contest-winners/lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: contestId, action: "unlock" }),
      });
      setLocked(false);
    } catch (err) {
      console.error("Unlock bracket error:", err);
    }
  };

  // Reset a series match to 0–0 and cascade-clear any downstream advancement.
  const handleSeriesReset = async (matchId: string) => {
    if (!contestId) return;
    const prevMatches = matches;
    setMatches((prev) => {
      const byId = new Map(prev.map((m) => [m.id, { ...m }]));
      const match = byId.get(matchId);
      if (!match) return prev;
      cascadeClear(byId, match);
      match.slot1_wins = 0;
      match.slot2_wins = 0;
      return Array.from(byId.values());
    });

    try {
      const res = await fetch("/api/admin/cornhole/bracket/advance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, action: "reset" }),
      });
      if (!res.ok) setMatches(prevMatches);
    } catch (e) {
      console.error("[Series reset error]", e);
      setMatches(prevMatches);
    }
  };

  // Advance / un-advance a match winner (optimistic)
  const handleAdvance = async (matchId: string, participantId: string) => {
    if (!contestId) return;

    // Optimistic update
    const prevMatches = matches;
    setMatches((prev) => applyOptimistic(prev, matchId, participantId));

    // Fire API in background, reconcile with server state
    try {
      const res = await fetch("/api/admin/cornhole/bracket/advance", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ match_id: matchId, participant_id: participantId }),
      });
      if (!res.ok) {
        setMatches(prevMatches);
      } else {
        // Check if there's now a champion — notify parent to update
        setMatches((current) => {
          if (computeChampionId(current)) {
            setTimeout(() => onChampionCrowned?.(), 100);
            setLocked(true);
          }
          return current;
        });
      }
    } catch (e) {
      console.error("[Bracket advance error]", e);
      setMatches(prevMatches);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contestId) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No {isSingles ? "Cornhole Singles" : "Cornhole Doubles"} contest found. Add one in the Contests section.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500">
          {participantCount} {isSingles ? "player" : "team"}{participantCount !== 1 ? "s" : ""}
        </span>
        <button
          onClick={() => setShowRealNames(!showRealNames)}
          className="text-xs text-green-700 font-medium"
        >
          Show {showRealNames ? "nicknames" : "real names"}
        </button>
      </div>

      {/* Locked state: unlock button */}
      {locked && (
        <div className="mb-4 space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
            <svg className="w-4 h-4 text-amber-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-xs text-amber-700 flex-1">
              This bracket is locked because winners have been resolved.
            </p>
            <button
              onClick={() =>
                setConfirmModal({
                  title: "Unlock Bracket",
                  message:
                    "Unlocking this bracket will clear the resolved winners for this contest and allow bracket changes. Are you sure?",
                  confirmLabel: "Unlock",
                  destructive: false,
                  onConfirm: handleUnlock,
                })
              }
              className="text-xs font-medium text-amber-700 bg-amber-100 px-3 py-1.5 rounded-lg hover:bg-amber-200 flex-shrink-0"
            >
              Unlock
            </button>
          </div>
        </div>
      )}

      {/* Format picker — doubles only, before generation. Locked once a bracket exists. */}
      {!isSingles && !locked && matches.length === 0 && (
        <div className="mb-4 space-y-2">
          <div className="text-xs font-semibold text-gray-600 uppercase tracking-wide">
            Tournament format
          </div>
          <div className="space-y-1.5">
            {DOUBLES_FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`flex items-start gap-2.5 px-3 py-2.5 rounded-lg border cursor-pointer ${
                  bracketFormat === opt.value
                    ? "border-green-500 bg-green-50"
                    : "border-gray-200 bg-white active:bg-gray-50"
                }`}
              >
                <input
                  type="radio"
                  name="bracket-format"
                  value={opt.value}
                  checked={bracketFormat === opt.value}
                  onChange={() => setBracketFormat(opt.value)}
                  className="mt-0.5 accent-green-600"
                />
                <span className="flex-1">
                  <span className="block text-sm font-medium text-gray-900">{opt.label}</span>
                  <span className="block text-xs text-gray-500 mt-0.5">{opt.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Format readout once a bracket is generated (doubles only) */}
      {!isSingles && matches.length > 0 && (
        <div className="mb-3 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs text-gray-600">
          Format:{" "}
          <span className="font-semibold text-gray-800">
            {DOUBLES_FORMAT_OPTIONS.find((o) => o.value === bracketFormat)?.label || bracketFormat}
          </span>
          {!locked && <span className="text-gray-400"> · reset bracket to change</span>}
        </div>
      )}

      {/* Action buttons (hidden when locked) */}
      {!locked && (
        <div className="flex gap-2 mb-4">
          {matches.length === 0 ? (
            <button
              onClick={handleGenerate}
              disabled={saving === "generate" || participantCount < 2}
              className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700 disabled:opacity-50"
            >
              {saving === "generate" ? "Generating..." : "Generate Bracket"}
            </button>
          ) : (
            <>
              <button
                onClick={handleGenerate}
                disabled={!!saving}
                className="flex-1 py-2.5 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700 disabled:opacity-50"
              >
                {saving === "generate" ? "Regenerating..." : "Regenerate (Reshuffle)"}
              </button>
              <button
                onClick={handleReset}
                disabled={!!saving}
                className="py-2.5 px-4 bg-red-50 text-red-600 text-sm font-semibold rounded-lg active:bg-red-100 disabled:opacity-50"
              >
                Reset
              </button>
            </>
          )}
        </div>
      )}

      {participantCount < 2 && matches.length === 0 && (
        <p className="text-xs text-amber-600 mb-4">
          Need at least 2 {isSingles ? "participants" : "teams"} to generate a bracket.
          {!isSingles && " Set up teams in the Cornhole Doubles section first."}
        </p>
      )}

      {/* Bracket */}
      <BracketView
        matches={matches}
        nameMap={nameMap}
        showRealNames={showRealNames}
        onSlotClick={locked ? undefined : handleAdvance}
        onSeriesReset={locked ? undefined : handleSeriesReset}
      />

      {/* Confirm modal */}
      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel={confirmModal?.confirmLabel || "Confirm"}
        destructive={confirmModal?.destructive ?? true}
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
