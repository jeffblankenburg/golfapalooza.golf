import { CardGameTable } from "./ContestCard";
import { resolvePayouts } from "@/lib/v2/contests/squares";
import { buildGameAllocations } from "@/lib/v2/contests/squares-alloc";
import { money, type SquaresContestRow } from "@/app/new/[slug]/admin/contests/SquaresEditor";
import type { PickemGamePreview } from "@/lib/v2/contests/pickem-preview";
import { formatInstant } from "@/lib/v2/timezone";

/** Short team label: ESPN abbreviation, else full name. */
function teamShort(g: PickemGamePreview, side: "away" | "home"): string {
  const abbrev = side === "away" ? g.awayAbbrev : g.homeAbbrev;
  const full = side === "away" ? g.awayTeam : g.homeTeam;
  return (abbrev || "").trim() || full;
}
/** Team label with the line inline — the favorite carries "-spread". */
function teamWithLine(g: PickemGamePreview, side: "away" | "home"): string {
  const label = teamShort(g, side);
  if (g.isTiebreaker || g.spread == null || !g.favorite || g.favorite !== side) return label;
  return `${label} -${g.spread}`;
}
function gameWhen(iso: string | null, timeZone: string): string {
  if (!iso) return "TBD";
  // Compact date + time in the zone, WITHOUT the long "Eastern Time" label (it would
  // crush the matchup column in this tiny preview table).
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
  } catch {
    return "TBD";
  }
}

/** Pick'em accordion body: the slate (tiebreaker excluded), matchups with the line,
 *  the covering side bolded once scored, and the % correct / crowd majority. */
export function PickemPreview({ games, timeZone }: { games: PickemGamePreview[]; timeZone: string }) {
  const realGames = games.filter((g) => !g.isTiebreaker);
  return (
    <CardGameTable
      empty="No games yet. Open the Pick'em to build the slate."
      rows={realGames.map((g, i) => ({
        key: String(i),
        when: gameWhen(g.gameTime, timeZone),
        game: (
          <>
            <span style={{ fontWeight: g.scored && g.winner === "away" ? 800 : undefined }}>{teamWithLine(g, "away")}</span>
            {" @ "}
            <span style={{ fontWeight: g.scored && g.winner === "home" ? 800 : undefined }}>{teamWithLine(g, "home")}</span>
          </>
        ),
        pay: g.scored ? (g.pctCorrect != null ? `${g.pctCorrect}%` : "Final") : (g.majoritySide ? `${teamShort(g, g.majoritySide)} ${g.majorityPct}%` : ""),
      }))}
    />
  );
}

/** Squares accordion body: games in kickoff order with each game's payout slice
 *  (and a "rest" badge for the remainder game). */
export function SquaresPreview({ row, timeZone }: { row: SquaresContestRow; timeZone: string }) {
  const cPot = row.cellCostCents * 100;
  const cAlloc = buildGameAllocations(
    row.games.map((g) => ({ id: g.espnEventId, league: g.league, game_alloc: g.gameAlloc, period_alloc: g.periodAlloc })),
    cPot,
    { potAllocation: row.potAllocation, periodWeights: row.periodWeights },
  );
  const centsByGame = new Map(resolvePayouts(cPot, cAlloc).games.map((rg) => [rg.key, rg.cents]));
  const orderedGames = [...row.games].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
  return (
    <CardGameTable
      empty="No games yet. Tap the gear to add some."
      rows={orderedGames.map((g) => ({
        key: g.espnEventId,
        when: g.startTime ? formatInstant(g.startTime, timeZone, { month: "short", day: "numeric" }) : "TBD",
        game: g.label || "Game",
        pay: money(centsByGame.get(g.espnEventId) ?? 0),
      }))}
    />
  );
}
