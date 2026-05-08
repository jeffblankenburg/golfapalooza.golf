"use client";

import { useMemo } from "react";
import { computeChampionId } from "@/lib/bracket/champion";

// Re-export for consumers that imported from here
export { computeChampionId } from "@/lib/bracket/champion";

// ── Constants ────────────────────────────────────────────────────────
const MATCH_H = 56; // match card height (2 × 28px slots)
const MATCH_GAP = 8; // gap between matches in round 1
const COL_W = 152; // match column width
const CONN_W = 28; // connector column width

// ── Types ────────────────────────────────────────────────────────────
export interface BracketMatchData {
  id: string;
  bracket_type: string;
  round_number: number;
  match_number: number;
  slot1_participant_id: string | null;
  slot2_participant_id: string | null;
  winner_participant_id: string | null;
  seed1: number | null;
  seed2: number | null;
  is_bye: boolean;
  next_winner_match_id: string | null;
  next_winner_slot: number | null;
  next_loser_match_id: string | null;
  next_loser_slot: number | null;
  series_best_of?: number | null;
  slot1_wins?: number | null;
  slot2_wins?: number | null;
}

interface BracketViewProps {
  matches: BracketMatchData[];
  nameMap: Record<string, { display_name: string; full_name: string | null }>;
  showRealNames?: boolean;
  bracketLabel?: string;
  onSlotClick?: (matchId: string, participantId: string) => void;
  onSeriesReset?: (matchId: string) => void;
}

export function BracketView({
  matches,
  nameMap,
  showRealNames = false,
  bracketLabel,
  onSlotClick,
  onSeriesReset,
}: BracketViewProps) {
  const championId = useMemo(() => computeChampionId(matches), [matches]);

  const grouped = useMemo(() => {
    const groups: Record<string, Record<number, BracketMatchData[]>> = {};
    for (const m of matches) {
      if (!groups[m.bracket_type]) groups[m.bracket_type] = {};
      if (!groups[m.bracket_type][m.round_number])
        groups[m.bracket_type][m.round_number] = [];
      groups[m.bracket_type][m.round_number].push(m);
    }
    for (const bt of Object.keys(groups)) {
      for (const r of Object.keys(groups[bt])) {
        groups[bt][Number(r)].sort((a, b) => a.match_number - b.match_number);
      }
    }
    return groups;
  }, [matches]);

  const getName = (id: string | null) => {
    if (!id) return null;
    const entry = nameMap[id];
    if (!entry) return "TBD";
    return showRealNames && entry.full_name ? entry.full_name : entry.display_name;
  };

  const bracketTypes = Object.keys(grouped).sort((a, b) => {
    const order = { winners: 0, main: 0, losers: 1, championship: 2 };
    return (
      (order[a as keyof typeof order] ?? 3) -
      (order[b as keyof typeof order] ?? 3)
    );
  });

  if (matches.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No bracket generated yet.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {bracketLabel && (
        <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wide">
          {bracketLabel}
        </h3>
      )}
      {bracketTypes.map((bt) => (
        <BracketSection
          key={bt}
          bracketType={bt}
          roundsMap={grouped[bt]}
          getName={getName}
          showLabel={bracketTypes.length > 1}
          onSlotClick={onSlotClick}
          onSeriesReset={onSeriesReset}
          championId={championId}
        />
      ))}
    </div>
  );
}

// ── BracketSection ───────────────────────────────────────────────────

function BracketSection({
  bracketType,
  roundsMap,
  getName,
  showLabel,
  onSlotClick,
  onSeriesReset,
  championId,
}: {
  bracketType: string;
  roundsMap: Record<number, BracketMatchData[]>;
  getName: (id: string | null) => string | null;
  showLabel: boolean;
  onSlotClick?: (matchId: string, participantId: string) => void;
  onSeriesReset?: (matchId: string) => void;
  championId: string | null;
}) {
  const rounds = Object.keys(roundsMap)
    .map(Number)
    .sort((a, b) => a - b);

  const labels: Record<string, string> = {
    main: "Bracket",
    winners: "Winners Bracket",
    losers: "Losers Bracket",
    championship: "Championship",
  };

  // Compute match Y positions for each round
  const roundPositions = useMemo(() => {
    const positions: number[][] = [];

    // Round 1: evenly spaced
    const r1Matches = roundsMap[rounds[0]] || [];
    const r1Positions: number[] = [];
    for (let i = 0; i < r1Matches.length; i++) {
      r1Positions.push(i * (MATCH_H + MATCH_GAP));
    }
    positions.push(r1Positions);

    // Subsequent rounds: position based on ratio with previous round
    for (let ri = 1; ri < rounds.length; ri++) {
      const prevPositions = positions[ri - 1];
      const curMatches = roundsMap[rounds[ri]] || [];
      const prevCount = prevPositions.length;
      const curCount = curMatches.length;
      const curPositions: number[] = [];

      if (curCount === prevCount) {
        // 1:1 — align each match with its corresponding feeder
        for (let mi = 0; mi < curCount; mi++) {
          curPositions.push(
            mi < prevPositions.length
              ? prevPositions[mi]
              : (curPositions[mi - 1] ?? 0) + MATCH_H + MATCH_GAP
          );
        }
      } else {
        // 2:1 reduction — center between feeder pairs
        for (let mi = 0; mi < curCount; mi++) {
          const feeder1Idx = mi * 2;
          const feeder2Idx = mi * 2 + 1;

          if (feeder2Idx < prevPositions.length) {
            const mid1 = prevPositions[feeder1Idx] + MATCH_H / 2;
            const mid2 = prevPositions[feeder2Idx] + MATCH_H / 2;
            curPositions.push((mid1 + mid2) / 2 - MATCH_H / 2);
          } else if (feeder1Idx < prevPositions.length) {
            curPositions.push(prevPositions[feeder1Idx]);
          } else {
            curPositions.push(
              (curPositions[mi - 1] ?? 0) + MATCH_H + MATCH_GAP
            );
          }
        }
      }
      positions.push(curPositions);
    }

    return positions;
  }, [roundsMap, rounds]);

  // Total height of the bracket
  const totalHeight = useMemo(() => {
    let max = 0;
    for (const posArr of roundPositions) {
      for (const y of posArr) {
        if (y + MATCH_H > max) max = y + MATCH_H;
      }
    }
    return max;
  }, [roundPositions]);

  const totalWidth =
    rounds.length * COL_W + Math.max(0, rounds.length - 1) * CONN_W;

  return (
    <div>
      {showLabel && (
        <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
          {labels[bracketType] || bracketType}
        </h4>
      )}
      <div className="overflow-x-auto -mx-4 px-4">
        <div
          style={{
            position: "relative",
            width: totalWidth,
            minHeight: totalHeight + 24, // 24px for round labels
          }}
        >
          {/* Round labels */}
          <div className="flex" style={{ width: totalWidth }}>
            {rounds.map((round, ri) => {
              const matchesInRound = roundsMap[round] || [];
              const seriesMatch = matchesInRound.find((m) => m.series_best_of);
              const label = getRoundLabel(bracketType, round, rounds.length);
              const finalLabel = seriesMatch
                ? `${label} · Best of ${seriesMatch.series_best_of}`
                : label;
              return (
                <div
                  key={round}
                  className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider text-center"
                  style={{
                    width: COL_W,
                    marginLeft: ri > 0 ? CONN_W : 0,
                  }}
                >
                  {finalLabel}
                </div>
              );
            })}
          </div>

          {/* Matches and connectors */}
          <div style={{ position: "relative", marginTop: 4 }}>
            {rounds.map((round, ri) => {
              const roundMatches = roundsMap[round];
              const positions = roundPositions[ri];
              const xOffset = ri * (COL_W + CONN_W);

              return (
                <div key={round}>
                  {/* Match cards (skip byes and empty reset matches) */}
                  {roundMatches.map((match, mi) => {
                    if (match.is_bye) return null;
                    // Hide empty championship reset match
                    if (
                      match.bracket_type === "championship" &&
                      match.round_number === 2 &&
                      !match.slot1_participant_id &&
                      !match.slot2_participant_id
                    )
                      return null;
                    const seriesInProgress =
                      !!match.series_best_of &&
                      !match.winner_participant_id &&
                      ((match.slot1_wins ?? 0) > 0 || (match.slot2_wins ?? 0) > 0);
                    return (
                      <div
                        key={match.id}
                        style={{
                          position: "absolute",
                          left: xOffset,
                          top: positions[mi],
                          width: COL_W,
                          height: MATCH_H,
                        }}
                      >
                        <MatchCard
                          match={match}
                          getName={getName}
                          onSlotClick={onSlotClick}
                          championId={championId}
                        />
                        {onSeriesReset && seriesInProgress && (
                          <button
                            onClick={() => onSeriesReset(match.id)}
                            style={{ position: "absolute", top: MATCH_H + 2, left: 0, right: 0 }}
                            className="text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-md py-0.5 active:bg-amber-100"
                          >
                            Reset series
                          </button>
                        )}
                      </div>
                    );
                  })}

                  {/* Connector SVGs between this round and next */}
                  {ri < rounds.length - 1 && (
                    <ConnectorColumn
                      fromPositions={positions}
                      toPositions={roundPositions[ri + 1]}
                      xOffset={xOffset + COL_W}
                      fromMatches={roundMatches}
                      toMatches={roundsMap[rounds[ri + 1]] || []}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── ConnectorColumn ──────────────────────────────────────────────────

function ConnectorColumn({
  fromPositions,
  toPositions,
  xOffset,
  fromMatches,
  toMatches,
}: {
  fromPositions: number[];
  toPositions: number[];
  xOffset: number;
  fromMatches: BracketMatchData[];
  toMatches: BracketMatchData[];
}) {
  const toMatchCount = toMatches.length;

  // Find the full Y range for the SVG
  let minY = Infinity;
  let maxY = -Infinity;
  for (const y of fromPositions) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + MATCH_H);
  }
  for (const y of toPositions) {
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y + MATCH_H);
  }

  const svgHeight = maxY - minY;
  if (svgHeight <= 0) return null;

  const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];
  const stubLeft = 4;
  const stubRight = CONN_W - 4;
  const is1to1 = fromPositions.length === toMatchCount;

  for (let ti = 0; ti < toMatchCount; ti++) {
    // Skip connectors to bye matches
    if (toMatches[ti]?.is_bye) continue;
    // Skip connectors to hidden empty reset matches
    const toMatch = toMatches[ti];
    if (
      toMatch?.bracket_type === "championship" &&
      toMatch?.round_number === 2 &&
      !toMatch?.slot1_participant_id &&
      !toMatch?.slot2_participant_id
    )
      continue;

    const toMid = toPositions[ti] + MATCH_H / 2 - minY;

    if (is1to1) {
      // 1:1 — straight horizontal line from feeder to match
      if (ti < fromPositions.length && !fromMatches[ti]?.is_bye) {
        const fromMid = fromPositions[ti] + MATCH_H / 2 - minY;
        lines.push({ x1: stubLeft, y1: fromMid, x2: stubRight, y2: toMid });
      }
    } else {
      // 2:1 — bracket-style connectors
      const feeder1Idx = ti * 2;
      const feeder2Idx = ti * 2 + 1;
      const feeder1IsBye = fromMatches[feeder1Idx]?.is_bye;
      const feeder2IsBye = fromMatches[feeder2Idx]?.is_bye;

      if (feeder2Idx < fromPositions.length) {
        if (feeder1IsBye && feeder2IsBye) {
          // Both feeders are byes — no connector needed
          continue;
        } else if (feeder1IsBye || feeder2IsBye) {
          // One feeder is a bye — draw a single line from the real match
          const realIdx = feeder1IsBye ? feeder2Idx : feeder1Idx;
          const fromMid = fromPositions[realIdx] + MATCH_H / 2 - minY;
          lines.push({ x1: stubLeft, y1: fromMid, x2: stubRight, y2: toMid });
        } else {
          // Normal 2:1 bracket connector
          const fromMid1 = fromPositions[feeder1Idx] + MATCH_H / 2 - minY;
          const fromMid2 = fromPositions[feeder2Idx] + MATCH_H / 2 - minY;
          const vertMidX = CONN_W / 2;

          lines.push({ x1: stubLeft, y1: fromMid1, x2: vertMidX, y2: fromMid1 });
          lines.push({ x1: stubLeft, y1: fromMid2, x2: vertMidX, y2: fromMid2 });
          lines.push({ x1: vertMidX, y1: fromMid1, x2: vertMidX, y2: fromMid2 });
          lines.push({ x1: vertMidX, y1: toMid, x2: stubRight, y2: toMid });
        }
      } else if (feeder1Idx < fromPositions.length && !feeder1IsBye) {
        const fromMid1 = fromPositions[feeder1Idx] + MATCH_H / 2 - minY;
        lines.push({ x1: stubLeft, y1: fromMid1, x2: stubRight, y2: toMid });
      }
    }
  }

  return (
    <svg
      style={{
        position: "absolute",
        left: xOffset,
        top: minY,
        width: CONN_W,
        height: svgHeight,
        overflow: "visible",
      }}
    >
      {lines.map((l, i) => (
        <line
          key={i}
          x1={l.x1}
          y1={l.y1}
          x2={l.x2}
          y2={l.y2}
          stroke="#d1d5db"
          strokeWidth={1.5}
        />
      ))}
    </svg>
  );
}

// ── getRoundLabel ────────────────────────────────────────────────────

function getRoundLabel(
  bracketType: string,
  round: number,
  totalRounds: number
): string {
  if (bracketType === "championship") {
    return round === 1 ? "Championship" : "Reset";
  }
  if (round === totalRounds) return "Final";
  if (round === totalRounds - 1) return "Semis";
  if (round === totalRounds - 2) return "Quarters";
  return `Round ${round}`;
}

// ── MatchCard ────────────────────────────────────────────────────────

function MatchCard({
  match,
  getName,
  onSlotClick,
  championId,
}: {
  match: BracketMatchData;
  getName: (id: string | null) => string | null;
  onSlotClick?: (matchId: string, participantId: string) => void;
  championId: string | null;
}) {
  const slot1Name = getName(match.slot1_participant_id);
  const slot2Name = getName(match.slot2_participant_id);

  const isClickable =
    !!onSlotClick &&
    !match.is_bye &&
    !!match.slot1_participant_id &&
    !!match.slot2_participant_id;

  const isSeries = !!match.series_best_of;
  const slot1Wins = match.slot1_wins ?? 0;
  const slot2Wins = match.slot2_wins ?? 0;

  return (
    <div
      className={`rounded-lg border text-xs overflow-hidden h-full ${
        match.is_bye
          ? "border-gray-200 bg-gray-50 opacity-60"
          : "border-gray-300 bg-white shadow-sm"
      }`}
    >
      <SlotRow
        name={slot1Name}
        seed={match.seed1}
        score={isSeries ? slot1Wins : null}
        isWinner={
          match.winner_participant_id === match.slot1_participant_id &&
          !!match.winner_participant_id
        }
        isChampion={
          !!championId &&
          match.winner_participant_id === match.slot1_participant_id &&
          match.slot1_participant_id === championId
        }
        isEmpty={!match.slot1_participant_id}
        clickable={isClickable}
        onClick={
          isClickable && match.slot1_participant_id
            ? () => onSlotClick!(match.id, match.slot1_participant_id!)
            : undefined
        }
      />
      <div className="border-t border-gray-200" />
      <SlotRow
        name={slot2Name}
        seed={match.seed2}
        score={isSeries ? slot2Wins : null}
        isWinner={
          match.winner_participant_id === match.slot2_participant_id &&
          !!match.winner_participant_id
        }
        isChampion={
          !!championId &&
          match.winner_participant_id === match.slot2_participant_id &&
          match.slot2_participant_id === championId
        }
        isEmpty={!match.slot2_participant_id}
        clickable={isClickable}
        onClick={
          isClickable && match.slot2_participant_id
            ? () => onSlotClick!(match.id, match.slot2_participant_id!)
            : undefined
        }
      />
    </div>
  );
}

// ── SlotRow ──────────────────────────────────────────────────────────

function SlotRow({
  name,
  seed,
  score,
  isWinner,
  isChampion,
  isEmpty,
  clickable,
  onClick,
}: {
  name: string | null;
  seed: number | null;
  score?: number | null;
  isWinner: boolean;
  isChampion?: boolean;
  isEmpty: boolean;
  clickable: boolean;
  onClick?: () => void;
}) {
  const winnerStyle = isChampion
    ? "bg-amber-100 font-bold text-amber-800"
    : isWinner
      ? "bg-green-50 font-bold text-green-800"
      : "";

  return (
    <div
      className={`flex items-center gap-1.5 px-2 py-1.5 min-h-[28px] ${winnerStyle} ${clickable ? "cursor-pointer active:bg-gray-100" : ""}`}
      onClick={onClick}
    >
      {seed !== null && (
        <span className="text-[10px] text-gray-400 w-4 text-right flex-shrink-0">
          {seed}
        </span>
      )}
      <span
        className={`truncate flex-1 ${isEmpty ? "text-gray-300 italic" : "text-gray-800"}`}
      >
        {name || "TBD"}
      </span>
      {score !== null && score !== undefined && (
        <span className="text-[11px] font-semibold tabular-nums w-4 text-right flex-shrink-0">
          {score}
        </span>
      )}
    </div>
  );
}
