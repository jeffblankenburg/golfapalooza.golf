import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { resolvePayouts, computeGamePayoutsFromSlices } from "@/lib/v2/contests/boxes";
import { buildGameAllocations } from "@/lib/v2/contests/boxes-alloc";
import { getLeague, fetchGameScore, periodScoresFromGame } from "@/lib/v2/sports/espn";
import MasterPayouts, { type PayoutPerson } from "./MasterPayouts";

/** Pool-wide master payouts: who won how much across every game, with pay links. */
export default async function MasterPayoutsPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data: contest } = await supabase
    .from("v2_contests")
    .select("id, name, config, contest_type, org_id")
    .eq("id", contestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contest || contest.contest_type !== "boxes") notFound();

  const [{ data: gameRows }, { data: cells }, { data: paidRows }] = await Promise.all([
    supabase.from("v2_boxes_games").select("id, espn_event_id, league, label, row_digits, col_digits, locked_at, period_scores, game_alloc, period_alloc").eq("contest_id", contestId).order("start_time", { ascending: true, nullsFirst: false }).order("sort_order"),
    supabase.from("v2_boxes_cells").select("grid_row, grid_col, user_id").eq("contest_id", contestId),
    supabase.from("v2_boxes_payouts").select("user_id, paid_cents, note").eq("contest_id", contestId),
  ]);

  const ownerById: Record<string, string> = {};
  for (const c of cells ?? []) if (c.user_id) ownerById[`${c.grid_row},${c.grid_col}`] = c.user_id;
  const claimed = (cells ?? []).filter((c) => c.user_id).length;
  const cfg = (contest.config as Record<string, unknown>) ?? {};
  const potCents = claimed * ((cfg.cell_cost_cents as number) ?? 0);

  const allocGames = buildGameAllocations(
    (gameRows ?? []).map((g) => ({ id: g.id as string, league: g.league as string, game_alloc: g.game_alloc, period_alloc: g.period_alloc })),
    potCents,
    { potAllocation: (cfg.pot_allocation as "equal" | "round_weighted" | "custom") ?? "equal", periodWeights: (cfg.period_weights as Record<string, Record<string, number>>) ?? {} },
  );
  const slicesByGame = new Map(resolvePayouts(potCents, allocGames).games.map((rg) => [rg.key, rg.periods]));

  // Aggregate winnings per person across every scored game.
  const won: Record<string, { total: number; lines: { label: string; amountCents: number }[] }> = {};
  for (const g of gameRows ?? []) {
    if (!g.locked_at) continue;
    const structure = getLeague(g.league as string)?.periods;
    if (structure !== "quarters" && structure !== "halves") continue;
    let ps = (g.period_scores as Record<string, { away: number | null; home: number | null } | null> | null) ?? null;
    if (!ps && g.espn_event_id) {
      const score = await fetchGameScore(g.league as string, g.espn_event_id as string);
      if (score) ps = periodScoresFromGame(score, structure);
    }
    if (!ps) continue;
    const payout = computeGamePayoutsFromSlices(
      { owners: ownerById, rowDigits: (g.row_digits as number[]) ?? [], colDigits: (g.col_digits as number[]) ?? [] },
      slicesByGame.get(g.id as string) ?? [],
      ps,
    );
    for (const pr of payout.perPeriod) {
      if (pr.ownerId && pr.amountCents > 0) {
        (won[pr.ownerId] ??= { total: 0, lines: [] }).total += pr.amountCents;
        won[pr.ownerId].lines.push({ label: `${g.label} ${pr.label}`, amountCents: pr.amountCents });
      }
    }
  }

  // Names + payment info for everyone who won.
  const winnerIds = Object.keys(won);
  const { data: profiles } = winnerIds.length
    ? await supabase.from("v2_profiles").select("id, display_name, venmo_username, paypal_username, mailing_address").in("id", winnerIds)
    : { data: [] as { id: string; display_name: string | null; venmo_username: string | null; paypal_username: string | null; mailing_address: string | null }[] };
  const profById = new Map((profiles ?? []).map((p) => [p.id, p]));
  const paidById = new Map((paidRows ?? []).map((r) => [r.user_id, { cents: r.paid_cents as number, note: (r.note as string) ?? null }]));

  const people: PayoutPerson[] = winnerIds
    .map((uid) => {
      const p = profById.get(uid);
      const paid = paidById.get(uid);
      return {
        userId: uid,
        name: p?.display_name || "Member",
        wonCents: won[uid].total,
        paidCents: paid?.cents ?? 0,
        note: paid?.note ?? null,
        venmo: p?.venmo_username ?? null,
        paypal: p?.paypal_username ?? null,
        address: p?.mailing_address ?? null,
        lines: won[uid].lines,
      };
    })
    .sort((a, b) => b.wonCents - a.wonCents);

  return <MasterPayouts orgId={org.id} slug={slug} contestId={contest.id} name={contest.name} people={people} />;
}
