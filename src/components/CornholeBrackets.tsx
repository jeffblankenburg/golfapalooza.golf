"use client";

import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import { BracketView, BracketMatchData, computeChampionId } from "@/components/BracketView";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { CornholeHeader } from "@/components/cornhole/CornholeHeader";

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
  headerAction,
}: {
  singlesContestId: string | null;
  doublesContestId: string | null;
  headerAction?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState<"singles" | "doubles" | null>(
    singlesContestId ? "singles" : doublesContestId ? "doubles" : null
  );

  const singles = useLiveBracket(singlesContestId);
  const doubles = useLiveBracket(doublesContestId);

  const hasSingles = !!singlesContestId;
  const hasDoubles = !!doublesContestId;

  const singlesReady = singles.matches.length > 0;
  const doublesReady = doubles.matches.length > 0;
  const anyReady = singlesReady || doublesReady;

  const topBar = (
    <div className="flex items-center justify-between">
      <Link
        href="/"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 active:bg-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>
      <div className="flex items-center gap-2">
        {headerAction}
        <PinnedNoteButton pinnedTo="cornhole" />
      </div>
    </div>
  );

  // No contests at all
  if (!hasSingles && !hasDoubles) {
    return (
      <div className="px-4 pt-6 pb-8 space-y-4">
        {topBar}
        <div className="text-center">
          <CornholeHeader size={280} />
          <p className="text-gray-500 text-sm mt-4">No cornhole contests set up yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      {topBar}
      <div className="text-center">
        <CornholeHeader size={anyReady ? 120 : 280} />
        {!anyReady && (
          <p className="text-gray-500 text-sm mt-4">Brackets coming soon.</p>
        )}
      </div>

      {hasSingles && singlesReady && (
        <BracketAccordion
          label="Singles"
          expanded={expanded === "singles"}
          onToggle={() =>
            setExpanded(expanded === "singles" ? null : "singles")
          }
          loading={singles.loading}
          matches={singles.matches}
          nameMap={singles.nameMap}
          showRealNames={false}
        />
      )}

      {hasDoubles && doublesReady && (
        <BracketAccordion
          label="Doubles"
          expanded={expanded === "doubles"}
          onToggle={() =>
            setExpanded(expanded === "doubles" ? null : "doubles")
          }
          loading={doubles.loading}
          matches={doubles.matches}
          nameMap={doubles.nameMap}
          showRealNames={false}
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
            <span className="text-xs text-orange-600 font-medium">{resultText}</span>
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
              <div className="w-6 h-6 border-2 border-orange-600 border-t-transparent rounded-full animate-spin" />
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
