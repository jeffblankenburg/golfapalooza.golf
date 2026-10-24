import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import GroupContestsAdmin, { type GroupContestItem } from "./GroupContestsAdmin";
import { type SquaresContestRow } from "./SquaresEditor";
import { coveringSide, type PickemGame } from "@/lib/v2/contests/pickem";
import { winningCell, ownerAt } from "@/lib/v2/contests/squares";
import { pickName } from "@/lib/v2/profile";

/**
 * Group-level contests — pools that belong to the whole group (event_id NULL),
 * available to all members, independent of the single active event. All types
 * (Squares, Pick'em, …) live in one list, created from one "Add contest" control.
 */
export default async function GroupContestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  // Every group-scoped contest, any type, newest first — one unified list.
  const { data: contests } = await supabase
    .from("v2_contests")
    .select("id, name, status, config, contest_type, created_at, collected_by")
    .eq("org_id", org.id)
    .is("event_id", null)
    .in("contest_type", ["squares", "pickem"])
    .order("created_at", { ascending: false });

  const squaresIds = (contests ?? []).filter((c) => c.contest_type === "squares").map((c) => c.id);
  const { data: games } = squaresIds.length
    ? await supabase
        .from("v2_squares_games")
        .select("contest_id, espn_event_id, league, label, team_row, team_col, start_time, game_alloc, period_alloc, sort_order, status, period_scores, row_digits, col_digits")
        .in("contest_id", squaresIds)
        .order("sort_order")
    : { data: [] as Record<string, unknown>[] };

  // Per-game final winner (owner of the final-period winning square) for completed
  // Squares games — the accordion's "Final" highlight. Owners come from the cells.
  const { data: squaresCells } = squaresIds.length
    ? await supabase.from("v2_squares_cells").select("contest_id, grid_row, grid_col, user_id").in("contest_id", squaresIds).not("user_id", "is", null)
    : { data: [] as { contest_id: string; grid_row: number; grid_col: number; user_id: string }[] };
  const ownersByContest = new Map<string, Record<string, string>>();
  for (const cell of squaresCells ?? []) {
    const m = ownersByContest.get(cell.contest_id as string) ?? {};
    m[`${cell.grid_row},${cell.grid_col}`] = cell.user_id as string;
    ownersByContest.set(cell.contest_id as string, m);
  }
  const ownerIds = [...new Set((squaresCells ?? []).map((c) => c.user_id as string))];
  const { data: ownerProfiles } = ownerIds.length
    ? await supabase.from("v2_profiles").select("id, display_name, first_name, last_name").in("id", ownerIds)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null }[] };
  const ownerName = new Map((ownerProfiles ?? []).map((p) => [p.id as string, pickName(p, org.name_display)]));
  // "contestId:espnEventId" → { final, winner } (the same game can live in two pools
  // with different numbers/cells, so key by contest too).
  const squaresResult = new Map<string, { final: boolean; winner: string | null }>();
  for (const g of games ?? []) {
    const key = `${g.contest_id}:${g.espn_event_id}`;
    const final = (g.status as string) === "final";
    if (!final) { squaresResult.set(key, { final: false, winner: null }); continue; }
    const ps = (g.period_scores as Record<string, { away: number | null; home: number | null } | null> | null)?.Final ?? null;
    const grid = { owners: ownersByContest.get(g.contest_id as string) ?? {}, rowDigits: (g.row_digits as number[]) ?? [], colDigits: (g.col_digits as number[]) ?? [] };
    const cell = ps ? winningCell(grid, ps.away, ps.home) : null;
    const uid = ownerAt(grid, cell);
    squaresResult.set(key, { final: true, winner: uid ? (ownerName.get(uid) ?? "Member") : null });
  }

  // Pick'em enrichment: matchups (preview), participant count + buy-in (meta).
  const pickemIds = (contests ?? []).filter((c) => c.contest_type === "pickem").map((c) => c.id);
  const { data: pickemGames } = pickemIds.length
    ? await supabase.from("v2_pickem_games").select("id, contest_id, away_team, home_team, away_abbrev, home_abbrev, spread, favorite, away_score, home_score, winning_team, game_time, is_tiebreaker, sort_order").in("contest_id", pickemIds).order("sort_order")
    : { data: [] as Record<string, unknown>[] };
  const { data: pickemParts } = pickemIds.length
    ? await supabase.from("v2_contest_participants").select("contest_id").in("contest_id", pickemIds)
    : { data: [] as { contest_id: string }[] };
  const pickemPartCount = new Map<string, number>();
  for (const p of pickemParts ?? []) pickemPartCount.set(p.contest_id as string, (pickemPartCount.get(p.contest_id as string) || 0) + 1);

  // Per-game winner (ATS covering side) + % of pickers who covered — for the
  // accordion's completed-game highlight.
  const pickemGameIds = (pickemGames ?? []).map((g) => g.id as string);
  const { data: picks } = pickemGameIds.length
    ? await supabase.from("v2_pickem_picks").select("game_id, picked_team").in("game_id", pickemGameIds).not("picked_team", "is", null)
    : { data: [] as { game_id: string; picked_team: string }[] };
  const winnerByGame = new Map<string, "away" | "home" | null>();
  for (const g of pickemGames ?? []) winnerByGame.set(g.id as string, coveringSide(g as unknown as PickemGame));
  const pickTally = new Map<string, { covered: number; total: number }>();
  for (const p of picks ?? []) {
    const t = pickTally.get(p.game_id as string) ?? { covered: 0, total: 0 };
    t.total++;
    if (p.picked_team === winnerByGame.get(p.game_id as string)) t.covered++;
    pickTally.set(p.game_id as string, t);
  }

  const items: GroupContestItem[] = (contests ?? []).map((c) => {
    if (c.contest_type === "pickem") {
      return {
        kind: "pickem", id: c.id as string, createdAt: c.created_at as string, name: c.name as string, status: c.status as string,
        entryCents: Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0,
        collectedBy: (c as { collected_by?: string | null }).collected_by ?? null,
        participantCount: pickemPartCount.get(c.id as string) || 0,
        games: (pickemGames ?? [])
          .filter((g) => g.contest_id === c.id)
          .map((g) => {
            const scored = g.away_score != null && g.home_score != null;
            const tally = pickTally.get(g.id as string);
            return {
              awayTeam: g.away_team as string, homeTeam: g.home_team as string,
              awayAbbrev: (g.away_abbrev as string | null) ?? null, homeAbbrev: (g.home_abbrev as string | null) ?? null,
              spread: g.spread as number | null, favorite: (g.favorite as "away" | "home" | null) ?? null,
              gameTime: (g.game_time as string) ?? null, isTiebreaker: !!g.is_tiebreaker,
              scored, winner: scored ? (winnerByGame.get(g.id as string) ?? null) : null,
              pctCorrect: scored && tally && tally.total > 0 ? Math.round((tally.covered / tally.total) * 100) : null,
            };
          }),
      };
    }
    const cfg =
      (c.config as {
        cell_cost_cents?: number;
        pot_allocation?: string;
        period_weights?: SquaresContestRow["periodWeights"];
        max_squares_primary?: number;
        max_squares_secondary?: number | null;
        primary_ends_at?: string | null;
        secondary_ends_at?: string | null;
      } | null) ?? {};
    const box: SquaresContestRow = {
      id: c.id,
      name: c.name,
      status: c.status,
      phase: ((c.config as { phase?: string } | null)?.phase as string) ?? "setup",
      cellCostCents: cfg.cell_cost_cents ?? 0,
      potAllocation: (cfg.pot_allocation as SquaresContestRow["potAllocation"]) ?? "equal",
      periodWeights: cfg.period_weights ?? {},
      maxSquaresPrimary: cfg.max_squares_primary ?? 10,
      maxSquaresSecondary: cfg.max_squares_secondary === undefined ? null : cfg.max_squares_secondary,
      primaryEndsAt: cfg.primary_ends_at ?? null,
      secondaryEndsAt: cfg.secondary_ends_at ?? null,
      collectedBy: (c as { collected_by?: string | null }).collected_by ?? null,
      games: (games ?? [])
        .filter((g) => g.contest_id === c.id)
        .map((g) => ({
          espnEventId: g.espn_event_id as string,
          league: g.league as string,
          label: (g.label as string) ?? null,
          teamRow: (g.team_row as SquaresContestRow["games"][number]["teamRow"]) ?? null,
          teamCol: (g.team_col as SquaresContestRow["games"][number]["teamCol"]) ?? null,
          startTime: (g.start_time as string) ?? null,
          gameAlloc: (g.game_alloc as SquaresContestRow["games"][number]["gameAlloc"]) ?? null,
          periodAlloc: (g.period_alloc as SquaresContestRow["games"][number]["periodAlloc"]) ?? null,
        })),
    };
    const results: Record<string, { final: boolean; winner: string | null }> = {};
    for (const g of (games ?? []).filter((g) => g.contest_id === c.id)) {
      results[g.espn_event_id as string] = squaresResult.get(`${c.id}:${g.espn_event_id}`) ?? { final: false, winner: null };
    }
    return { kind: "squares", id: c.id as string, createdAt: c.created_at as string, box, results };
  });

  return <GroupContestsAdmin orgId={org.id} slug={slug} items={items} currentUserId={ctx.userId} nameMode={org.name_display} />;
}
