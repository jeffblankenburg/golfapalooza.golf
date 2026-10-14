import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { updateBoxesContest, type BoxesGameInput } from "@/lib/v2/contests/boxes-server";

type Params = Promise<{ id: string; contestId: string }>;

async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, contest_type, org_id")
    .eq("id", contestId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!contest || contest.contest_type !== "boxes") return { error: NextResponse.json({ error: "Boxes pool not found" }, { status: 404 }) };
  return { admin };
}

/** Edit/reconfigure a group Boxes pool (#230) — name, price, games, pot split. */
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: {
    name?: string;
    cell_cost_cents?: number;
    pot_allocation?: string;
    period_weights?: Record<string, Record<string, number>>;
    max_squares_primary?: number;
    max_squares_secondary?: number | null;
    primary_ends_at?: string | null;
    secondary_ends_at?: string | null;
    games?: BoxesGameInput[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const name = body.name != null ? body.name.trim() : undefined;
  if (name != null && !name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
  const cellCostCents = Number.isFinite(body.cell_cost_cents) ? Math.max(0, Math.round(body.cell_cost_cents as number)) : undefined;
  const potAllocation =
    body.pot_allocation === "equal" || body.pot_allocation === "round_weighted" || body.pot_allocation === "custom" ? body.pot_allocation : undefined;

  let games: BoxesGameInput[] | undefined;
  if (Array.isArray(body.games)) {
    if (body.games.length === 0) return NextResponse.json({ error: "Keep at least one game" }, { status: 400 });
    for (const x of body.games) {
      if (!x.espnEventId || !x.league || !x.teamRow || !x.teamCol) {
        return NextResponse.json({ error: "Each game needs a league, an ESPN id, and both teams" }, { status: 400 });
      }
    }
    games = body.games;
  }

  const periodWeights = body.period_weights && typeof body.period_weights === "object" ? body.period_weights : undefined;
  const maxSquaresPrimary = Number.isFinite(body.max_squares_primary) ? Math.max(1, Math.round(body.max_squares_primary as number)) : undefined;
  const maxSquaresSecondary =
    "max_squares_secondary" in body ? (body.max_squares_secondary == null ? null : Math.max(1, Math.round(body.max_squares_secondary))) : undefined;

  try {
    await updateBoxesContest(g.admin, contestId, {
      name,
      cellCostCents,
      potAllocation,
      periodWeights,
      maxSquaresPrimary,
      maxSquaresSecondary,
      primaryEndsAt: "primary_ends_at" in body ? body.primary_ends_at ?? null : undefined,
      secondaryEndsAt: "secondary_ends_at" in body ? body.secondary_ends_at ?? null : undefined,
      games,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

/** Delete a group Boxes pool (cascades to its games + squares). */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  const { error } = await g.admin.from("v2_contests").delete().eq("id", contestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
