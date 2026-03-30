"use client";

import { useState, useEffect, useCallback } from "react";
import { BracketView, BracketMatchData } from "@/components/BracketView";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

export function CornholeBracketManager({
  tripId,
  contestType,
}: {
  tripId: string;
  contestType: "cornhole_singles" | "cornhole_doubles";
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
    onConfirm: () => void;
  } | null>(null);

  const isSingles = contestType === "cornhole_singles";

  // Fetch contest ID
  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const c = (data.contests || []).find(
      (c: { contest_type: string }) => c.contest_type === contestType
    );
    setContestId(c?.id || null);
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
  }, [fetchContest, fetchBracket, fetchParticipantCount]);

  // Generate bracket (random seeding handled server-side)
  const handleGenerate = async () => {
    if (!contestId) return;
    setSaving("generate");
    const res = await fetch("/api/admin/cornhole/bracket", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contestId }),
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

  // Apply advance/un-advance optimistically to local matches state
  const applyOptimistic = (
    prev: BracketMatchData[],
    matchId: string,
    participantId: string
  ): BracketMatchData[] => {
    const byId = new Map(prev.map((m) => [m.id, { ...m }]));
    const match = byId.get(matchId);
    if (!match) return prev;

    const isUnadvance = match.winner_participant_id === participantId;

    if (isUnadvance) {
      // Cascade un-advance: clear this match and all downstream
      const clearDown = (m: BracketMatchData, depth: number) => {
        if (depth > 20) return;

        // Recurse into downstream winner match if it has a winner
        if (m.next_winner_match_id) {
          const next = byId.get(m.next_winner_match_id);
          if (next?.winner_participant_id) clearDown(next, depth + 1);
        }
        // Recurse into downstream loser match if it has a winner
        if (m.next_loser_match_id) {
          const next = byId.get(m.next_loser_match_id);
          if (next?.winner_participant_id) clearDown(next, depth + 1);
        }

        // Clear winner
        m.winner_participant_id = null;

        // Remove from next winner slot
        if (m.next_winner_match_id && m.next_winner_slot) {
          const next = byId.get(m.next_winner_match_id);
          if (next) {
            if (m.next_winner_slot === 1) next.slot1_participant_id = null;
            else next.slot2_participant_id = null;
          }
        }
        // Remove from next loser slot
        if (m.next_loser_match_id && m.next_loser_slot) {
          const next = byId.get(m.next_loser_match_id);
          if (next) {
            if (m.next_loser_slot === 1) next.slot1_participant_id = null;
            else next.slot2_participant_id = null;
          }
        }
        // Championship → reset special case: clear both slots of reset match
        if (m.next_loser_match_id && !m.next_loser_slot) {
          const reset = byId.get(m.next_loser_match_id);
          if (reset) {
            if (reset.winner_participant_id) clearDown(reset, depth + 1);
            reset.slot1_participant_id = null;
            reset.slot2_participant_id = null;
            reset.winner_participant_id = null;
          }
        }
      };
      clearDown(match, 0);
    } else {
      // If switching winners, un-advance old winner first
      if (match.winner_participant_id) {
        // Recursively clear using same logic
        const clearDown = (m: BracketMatchData, depth: number) => {
          if (depth > 20) return;
          if (m.next_winner_match_id) {
            const next = byId.get(m.next_winner_match_id);
            if (next?.winner_participant_id) clearDown(next, depth + 1);
          }
          if (m.next_loser_match_id) {
            const next = byId.get(m.next_loser_match_id);
            if (next?.winner_participant_id) clearDown(next, depth + 1);
          }
          m.winner_participant_id = null;
          if (m.next_winner_match_id && m.next_winner_slot) {
            const next = byId.get(m.next_winner_match_id);
            if (next) {
              if (m.next_winner_slot === 1) next.slot1_participant_id = null;
              else next.slot2_participant_id = null;
            }
          }
          if (m.next_loser_match_id && m.next_loser_slot) {
            const next = byId.get(m.next_loser_match_id);
            if (next) {
              if (m.next_loser_slot === 1) next.slot1_participant_id = null;
              else next.slot2_participant_id = null;
            }
          }
          // Championship → reset special case: clear both slots of reset match
          if (m.next_loser_match_id && !m.next_loser_slot) {
            const reset = byId.get(m.next_loser_match_id);
            if (reset) {
              if (reset.winner_participant_id) clearDown(reset, depth + 1);
              reset.slot1_participant_id = null;
              reset.slot2_participant_id = null;
              reset.winner_participant_id = null;
            }
          }
        };
        clearDown(match, 0);
      }

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
        // Revert on failure
        setMatches(prevMatches);
      }
    } catch {
      // Revert on network error
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

      {/* Action buttons */}
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
        onSlotClick={handleAdvance}
      />

      {/* Confirm modal */}
      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Reset"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
