import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { v2Now } from "@/lib/v2/simulator";
import { resolvePayouts } from "@/lib/v2/contests/boxes";
import { buildGameAllocations } from "@/lib/v2/contests/boxes-alloc";
import { loadPickemBoard } from "@/lib/v2/contests/pickem-server";
import BoxesPlay, { type PlayGame } from "./BoxesPlay";
// Same member component the event lane uses — mounted here with the group pick URL.
import PickemContent from "../../pickem/PickemContent";
import styles from "@/app/new/new.module.css";

/** Member-facing contest detail — branches by contest_type (Boxes board, Pick'em slate). */
export default async function ContestDetailPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data: contest } = await supabase
    .from("v2_contests")
    .select("id, name, status, config, contest_type, org_id")
    .eq("id", contestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contest) notFound();

  // Pick'em detail — same member UI as the event lane, group pick endpoint.
  if (contest.contest_type === "pickem") {
    if (contest.status !== "active") notFound(); // not open to members yet
    const board = await loadPickemBoard(supabase, { contestId, orgId: org.id, viewerId: ctx.userId, now: await v2Now() });
    return (
      <div className={`${styles.page} ${styles.orgPage}`}>
        <h1 className={styles.title}>{contest.name || "Pick'em"}</h1>
        <PickemContent
          pickUrl={`/api/v2/orgs/${org.id}/contests/${contestId}/pickem/pick`}
          games={board.games}
          initialPicks={board.myPicks}
          leaderboard={board.leaderboard}
          locked={board.locked}
          meId={ctx.userId}
          totalGames={board.totalGames}
        />
      </div>
    );
  }

  if (contest.contest_type !== "boxes") notFound();

  const { data: gameRows } = await supabase
    .from("v2_boxes_games")
    .select("id, label, league, team_row, team_col, row_digits, col_digits, locked_at, start_time, live_score, period_scores, game_alloc, period_alloc, status, sort_order")
    .eq("contest_id", contestId)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order");

  const { data: cells } = await supabase
    .from("v2_boxes_cells")
    .select("grid_row, grid_col, user_id")
    .eq("contest_id", contestId);

  const ownerIds = [...new Set([...(cells ?? []).map((c) => c.user_id).filter((x): x is string => !!x), ctx.userId])];
  const { data: profiles } = ownerIds.length
    ? await supabase.from("v2_profiles").select("id, display_name, avatar_url").in("id", ownerIds)
    : { data: [] as { id: string; display_name: string | null; avatar_url: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name || "Member"]));
  const avatarById = new Map((profiles ?? []).map((p) => [p.id, p.avatar_url ?? null]));
  const myName = nameById.get(ctx.userId) || "You";
  const myAvatar = avatarById.get(ctx.userId) ?? null;

  const owners: Record<string, string> = {};
  const avatars: Record<string, string | null> = {};
  const mine: string[] = [];
  for (const c of cells ?? []) {
    if (!c.user_id) continue;
    const k = `${c.grid_row},${c.grid_col}`;
    owners[k] = nameById.get(c.user_id) || "Member";
    avatars[k] = avatarById.get(c.user_id) ?? null;
    if (c.user_id === ctx.userId) mine.push(k);
  }

  const cfg = (contest.config as Record<string, unknown>) ?? {};

  // Resolve the flexible $/%/remainder payouts into per-period dollar slices (over
  // the actual sold pot) so the board can show what each square is worth.
  const claimedCount = (cells ?? []).filter((c) => c.user_id).length;
  const potCents = claimedCount * ((cfg.cell_cost_cents as number) ?? 0);
  const allocGames = buildGameAllocations(
    (gameRows ?? []).map((g) => ({ id: g.id as string, league: g.league as string, game_alloc: g.game_alloc, period_alloc: g.period_alloc })),
    potCents,
    { potAllocation: (cfg.pot_allocation as "equal" | "round_weighted" | "custom") ?? "equal", periodWeights: (cfg.period_weights as Record<string, Record<string, number>>) ?? {} },
  );
  const sliceCentsFor = new Map(resolvePayouts(potCents, allocGames).games.map((rg) => [rg.key, Object.fromEntries(rg.periods.map((p) => [p.key, p.cents]))]));

  const games: PlayGame[] = (gameRows ?? []).map((g) => ({
    id: g.id as string,
    label: (g.label as string) ?? "Game",
    league: (g.league as string) ?? "",
    teamRow: (g.team_row as PlayGame["teamRow"]) ?? null,
    teamCol: (g.team_col as PlayGame["teamCol"]) ?? null,
    rowDigits: (g.row_digits as number[]) ?? [],
    colDigits: (g.col_digits as number[]) ?? [],
    locked: !!g.locked_at,
    startTime: (g.start_time as string) ?? null,
    live: (g.live_score as PlayGame["live"]) ?? null,
    periodScores: (g.period_scores as PlayGame["periodScores"]) ?? null,
    periodCents: sliceCentsFor.get(g.id as string) ?? {},
  }));

  return (
    <BoxesPlay
      base={`/api/v2/orgs/${org.id}/contests/${contest.id}`}
      homeHref={`/new/${slug}`}
      name={contest.name}
      phase={(cfg.phase as string) ?? "setup"}
      cellCostCents={(cfg.cell_cost_cents as number) ?? 0}
      maxPrimary={(cfg.max_squares_primary as number) ?? 10}
      maxSecondary={(cfg.max_squares_secondary as number | null) ?? null}
      games={games}
      owners={owners}
      avatars={avatars}
      mine={mine}
      myName={myName}
      myAvatar={myAvatar}
    />
  );
}
