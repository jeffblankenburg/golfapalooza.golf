"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { BracketView, BracketMatchData, computeChampionId } from "@/components/BracketView";

const POLL_INTERVAL = 5000; // 5 seconds

interface BracketState {
  matches: BracketMatchData[];
  nameMap: Record<string, { display_name: string; full_name: string | null }>;
}

function useLiveBracket(contestId: string | null): BracketState & { loading: boolean } {
  const [state, setState] = useState<BracketState>({ matches: [], nameMap: {} });
  const [loading, setLoading] = useState(true);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  const fetchBracket = useCallback(async () => {
    if (!contestId) {
      setState({ matches: [], nameMap: {} });
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`/api/cornhole/bracket?contest_id=${contestId}`);
      if (res.ok) {
        const data = await res.json();
        setState({ matches: data.matches || [], nameMap: data.nameMap || {} });
      }
    } catch {
      // silently ignore polling errors
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    setLoading(true);
    fetchBracket();

    if (contestId) {
      intervalRef.current = setInterval(fetchBracket, POLL_INTERVAL);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [contestId, fetchBracket]);

  return { ...state, loading };
}

export function CornholeBrackets({
  singlesContestId,
  doublesContestId,
}: {
  singlesContestId: string | null;
  doublesContestId: string | null;
}) {
  const [expanded, setExpanded] = useState<"singles" | "doubles" | null>(
    singlesContestId ? "singles" : doublesContestId ? "doubles" : null
  );
  const [showRealNames, setShowRealNames] = useState(false);

  const singles = useLiveBracket(singlesContestId);
  const doubles = useLiveBracket(doublesContestId);

  const hasSingles = !!singlesContestId;
  const hasDoubles = !!doublesContestId;

  if (!hasSingles && !hasDoubles) {
    return (
      <div className="px-4 pt-6 text-center text-gray-500 text-sm">
        No cornhole contests set up yet.
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-3">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-lg font-bold text-gray-900">Cornhole</h1>
        <button
          onClick={() => setShowRealNames(!showRealNames)}
          className="text-xs text-green-700 font-medium"
        >
          Show {showRealNames ? "nicknames" : "real names"}
        </button>
      </div>

      {hasSingles && (
        <BracketAccordion
          label="Singles"
          expanded={expanded === "singles"}
          onToggle={() =>
            setExpanded(expanded === "singles" ? null : "singles")
          }
          loading={singles.loading}
          matches={singles.matches}
          nameMap={singles.nameMap}
          showRealNames={showRealNames}
        />
      )}

      {hasDoubles && (
        <BracketAccordion
          label="Doubles"
          expanded={expanded === "doubles"}
          onToggle={() =>
            setExpanded(expanded === "doubles" ? null : "doubles")
          }
          loading={doubles.loading}
          matches={doubles.matches}
          nameMap={doubles.nameMap}
          showRealNames={showRealNames}
        />
      )}
    </div>
  );
}

/**
 * Find the champion result text: "Winner defeated Loser"
 */
function getChampionResult(
  matches: BracketMatchData[],
  nameMap: Record<string, { display_name: string; full_name: string | null }>,
  showRealNames: boolean
): string | null {
  const championId = computeChampionId(matches);
  if (!championId) return null;

  const getName = (id: string | null) => {
    if (!id) return null;
    const entry = nameMap[id];
    if (!entry) return null;
    return showRealNames && entry.full_name ? entry.full_name : entry.display_name;
  };

  // Find the decisive match: reset if it has a winner, else championship round 1 or single-elim final
  const champMatches = matches.filter((m) => m.bracket_type === "championship");
  let decisiveMatch: BracketMatchData | undefined;

  if (champMatches.length > 0) {
    const reset = champMatches.find((m) => m.round_number === 2);
    if (reset?.winner_participant_id) {
      decisiveMatch = reset;
    } else {
      decisiveMatch = champMatches.find((m) => m.round_number === 1);
    }
  } else {
    const mainMatches = matches.filter((m) => m.bracket_type === "main");
    if (mainMatches.length > 0) {
      const maxRound = Math.max(...mainMatches.map((m) => m.round_number));
      decisiveMatch = mainMatches.find((m) => m.round_number === maxRound);
    }
  }

  if (!decisiveMatch?.winner_participant_id) return null;

  const winnerId = decisiveMatch.winner_participant_id;
  const loserId =
    decisiveMatch.slot1_participant_id === winnerId
      ? decisiveMatch.slot2_participant_id
      : decisiveMatch.slot1_participant_id;

  const winnerName = getName(winnerId);
  const loserName = getName(loserId);
  if (!winnerName || !loserName) return null;

  return `${winnerName} defeated ${loserName}`;
}

function BracketAccordion({
  label,
  expanded,
  onToggle,
  loading,
  matches,
  nameMap,
  showRealNames,
}: {
  label: string;
  expanded: boolean;
  onToggle: () => void;
  loading: boolean;
  matches: BracketMatchData[];
  nameMap: Record<string, { display_name: string; full_name: string | null }>;
  showRealNames: boolean;
}) {
  const resultText = !expanded ? getChampionResult(matches, nameMap, showRealNames) : null;

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50 transition-colors"
      >
        <div className="flex flex-col items-start">
          <span className="font-semibold text-gray-900">{label}</span>
          {resultText && (
            <span className="text-xs text-amber-600 font-medium">{resultText}</span>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : matches.length === 0 ? (
            <p className="text-center py-6 text-gray-400 text-sm">
              Bracket not generated yet.
            </p>
          ) : (
            <BracketView
              matches={matches}
              nameMap={nameMap}
              showRealNames={showRealNames}
            />
          )}
        </div>
      )}
    </div>
  );
}
