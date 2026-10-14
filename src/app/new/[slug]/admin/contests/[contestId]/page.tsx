import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { PERIOD_PRESETS, gamePotShares, computeGamePayouts } from "@/lib/v2/contests/boxes";
import { getLeague, fetchGameScore, periodScoresFromGame } from "@/lib/v2/sports/espn";
import BoxesManage, { type ManageGame, type PayoutRow } from "./BoxesManage";

export default async function BoxesDetailPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data: contest } = await supabase
    .from("v2_contests")
    .select("id, name, status, config, contest_type, org_id")
    .eq("id", contestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contest || contest.contest_type !== "boxes") notFound();

  const { data: gameRows } = await supabase
    .from("v2_boxes_games")
    .select("id, espn_event_id, league, label, team_row, team_col, row_digits, col_digits, locked_at, sort_order")
    .eq("contest_id", contestId)
    .order("sort_order");

  const { data: cells } = await supabase
    .from("v2_boxes_cells")
    .select("grid_row, grid_col, user_id")
    .eq("contest_id", contestId);

  // Owner names for any claimed squares.
  const ownerIds = [...new Set((cells ?? []).map((c) => c.user_id).filter((x): x is string => !!x))];
  const { data: profiles } = ownerIds.length
    ? await supabase.from("v2_profiles").select("id, display_name").in("id", ownerIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.display_name || "Member"]));

  const owners: Record<string, string> = {};
  for (const c of cells ?? []) if (c.user_id) owners[`${c.grid_row},${c.grid_col}`] = nameById.get(c.user_id) || "Member";
  const claimed = (cells ?? []).filter((c) => c.user_id).length;

  const games: ManageGame[] = (gameRows ?? []).map((g) => ({
    id: g.id as string,
    label: (g.label as string) ?? "Game",
    league: g.league as string,
    teamRow: (g.team_row as ManageGame["teamRow"]) ?? null,
    teamCol: (g.team_col as ManageGame["teamCol"]) ?? null,
    rowDigits: (g.row_digits as number[]) ?? [],
    colDigits: (g.col_digits as number[]) ?? [],
    locked: !!g.locked_at,
  }));

  const cfg = (contest.config as Record<string, unknown>) ?? {};

  // Payout sheet — auto-scored from ESPN (payouts are paid MANUALLY by the admin).
  // Fetch each locked game's live/final scores, compute winners + amounts (carry
  // rules), and aggregate what to pay each person.
  const ownerById: Record<string, string> = {};
  for (const c of cells ?? []) if (c.user_id) ownerById[`${c.grid_row},${c.grid_col}`] = c.user_id;

  const potCents = claimed * ((cfg.cell_cost_cents as number) ?? 0);
  const shares = gamePotShares(gameRows?.length ?? 0, potCents, (cfg.pot_allocation as "equal" | "round_weighted" | "custom") ?? "equal");
  const periodWeights = (cfg.period_weights as Record<string, Record<string, number>>) ?? {};

  const perUser: Record<string, { total: number; lines: { label: string; amountCents: number }[] }> = {};
  let anyScored = false;
  for (let i = 0; i < (gameRows ?? []).length; i++) {
    const g = gameRows![i];
    if (!g.locked_at) continue;
    const structure = getLeague(g.league as string)?.periods;
    if (structure !== "quarters" && structure !== "halves") continue;
    const score = g.espn_event_id ? await fetchGameScore(g.league as string, g.espn_event_id as string) : null;
    if (!score) continue;
    const ps = periodScoresFromGame(score, structure);
    if (Object.values(ps).some((v) => v)) anyScored = true;
    const payout = computeGamePayouts(
      { owners: ownerById, rowDigits: (g.row_digits as number[]) ?? [], colDigits: (g.col_digits as number[]) ?? [] },
      shares[i] ?? 0,
      PERIOD_PRESETS[structure],
      periodWeights[structure],
      ps,
    );
    for (const [uid, cents] of Object.entries(payout.byOwner)) {
      perUser[uid] ??= { total: 0, lines: [] };
      perUser[uid].total += cents;
    }
    for (const pr of payout.perPeriod) {
      if (pr.ownerId && pr.amountCents > 0) perUser[pr.ownerId].lines.push({ label: `${g.label} ${pr.label}`, amountCents: pr.amountCents });
    }
  }
  const payouts: PayoutRow[] = Object.entries(perUser)
    .map(([uid, v]) => ({ name: nameById.get(uid) || "Member", totalCents: v.total, lines: v.lines }))
    .sort((a, b) => b.totalCents - a.totalCents);

  return (
    <BoxesManage
      orgId={org.id}
      slug={slug}
      contestId={contest.id}
      name={contest.name}
      phase={(cfg.phase as string) ?? "setup"}
      cellCostCents={(cfg.cell_cost_cents as number) ?? 0}
      games={games}
      owners={owners}
      claimed={claimed}
      payouts={payouts}
      anyScored={anyScored}
    />
  );
}
