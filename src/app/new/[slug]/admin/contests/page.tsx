import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import GroupContestsAdmin, { type GroupContestItem } from "./GroupContestsAdmin";
import { type SquaresContestRow } from "./SquaresEditor";
import { type PayoutSplit } from "@/lib/v2/contests/pickem";
import { buildPickemPreviews } from "@/lib/v2/contests/pickem-preview";

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
    .select("id, name, status, config, contest_type, created_at, collected_by, payout_splits")
    .eq("org_id", org.id)
    .is("event_id", null)
    .in("contest_type", ["squares", "pickem"])
    .order("created_at", { ascending: false });

  const squaresIds = (contests ?? []).filter((c) => c.contest_type === "squares").map((c) => c.id);
  const { data: games } = squaresIds.length
    ? await supabase
        .from("v2_squares_games")
        .select("contest_id, espn_event_id, league, label, team_row, team_col, start_time, game_alloc, period_alloc, sort_order")
        .in("contest_id", squaresIds)
        .order("sort_order")
    : { data: [] as Record<string, unknown>[] };

  // Pick'em enrichment: matchups (preview), participant count + buy-in (meta).
  const pickemIds = (contests ?? []).filter((c) => c.contest_type === "pickem").map((c) => c.id);
  const [pickemPreviews, { data: pickemParts }] = await Promise.all([
    buildPickemPreviews(supabase, pickemIds),
    pickemIds.length
      ? supabase.from("v2_contest_participants").select("contest_id").in("contest_id", pickemIds)
      : Promise.resolve({ data: [] as { contest_id: string }[] }),
  ]);
  const pickemPartCount = new Map<string, number>();
  for (const p of pickemParts ?? []) pickemPartCount.set(p.contest_id as string, (pickemPartCount.get(p.contest_id as string) || 0) + 1);

  const items: GroupContestItem[] = (contests ?? []).map((c) => {
    if (c.contest_type === "pickem") {
      return {
        kind: "pickem", id: c.id as string, createdAt: c.created_at as string, name: c.name as string, status: c.status as string,
        entryCents: Number((c.config as { entry_cents?: number } | null)?.entry_cents) || 0,
        collectedBy: (c as { collected_by?: string | null }).collected_by ?? null,
        payoutSplits: ((c as { payout_splits?: unknown }).payout_splits as PayoutSplit[] | null) ?? [],
        participantCount: pickemPartCount.get(c.id as string) || 0,
        games: pickemPreviews.get(c.id as string) || [],
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
    return { kind: "squares", id: c.id as string, createdAt: c.created_at as string, box };
  });

  return <GroupContestsAdmin orgId={org.id} slug={slug} items={items} currentUserId={ctx.userId} nameMode={org.name_display} />;
}
