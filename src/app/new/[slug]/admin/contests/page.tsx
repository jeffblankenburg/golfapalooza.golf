import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import BoxesAdmin, { type BoxesContestRow } from "./BoxesAdmin";

/**
 * Group-level contests — pools that belong to the whole group (event_id NULL),
 * available to all members, independent of the single active event. Today: Boxes.
 */
export default async function GroupContestsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data: contests } = await supabase
    .from("v2_contests")
    .select("id, name, status, config, created_at")
    .eq("org_id", org.id)
    .is("event_id", null)
    .eq("contest_type", "boxes")
    .order("created_at", { ascending: false });

  const ids = (contests ?? []).map((c) => c.id);
  const { data: games } = ids.length
    ? await supabase
        .from("v2_boxes_games")
        .select("contest_id, espn_event_id, league, label, team_row, team_col, start_time, sort_order")
        .in("contest_id", ids)
        .order("sort_order")
    : { data: [] as Record<string, unknown>[] };

  const rows: BoxesContestRow[] = (contests ?? []).map((c) => {
    const cfg =
      (c.config as {
        cell_cost_cents?: number;
        pot_allocation?: string;
        period_weights?: BoxesContestRow["periodWeights"];
        max_squares_primary?: number;
        max_squares_secondary?: number | null;
        primary_ends_at?: string | null;
        secondary_ends_at?: string | null;
      } | null) ?? {};
    return {
      id: c.id,
      name: c.name,
      status: c.status,
      cellCostCents: cfg.cell_cost_cents ?? 0,
      potAllocation: (cfg.pot_allocation as BoxesContestRow["potAllocation"]) ?? "equal",
      periodWeights: cfg.period_weights ?? {},
      maxSquaresPrimary: cfg.max_squares_primary ?? 10,
      maxSquaresSecondary: cfg.max_squares_secondary === undefined ? null : cfg.max_squares_secondary,
      primaryEndsAt: cfg.primary_ends_at ?? null,
      secondaryEndsAt: cfg.secondary_ends_at ?? null,
      games: (games ?? [])
        .filter((g) => g.contest_id === c.id)
        .map((g) => ({
          espnEventId: g.espn_event_id as string,
          league: g.league as string,
          label: (g.label as string) ?? null,
          teamRow: (g.team_row as BoxesContestRow["games"][number]["teamRow"]) ?? null,
          teamCol: (g.team_col as BoxesContestRow["games"][number]["teamCol"]) ?? null,
          startTime: (g.start_time as string) ?? null,
        })),
    };
  });

  return <BoxesAdmin orgId={org.id} slug={slug} contests={rows} />;
}
