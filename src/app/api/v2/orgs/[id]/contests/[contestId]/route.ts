import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { updateBoxesContest, type BoxesGameInput } from "@/lib/v2/contests/boxes-server";

type Params = Promise<{ id: string; contestId: string }>;

// Generic contest-level fields editable on non-Boxes group contests (e.g. Pick'em).
const EDITABLE = new Set(["status", "payout_splits", "name", "collected_by"]);

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
  if (!contest) return { error: NextResponse.json({ error: "Contest not found" }, { status: 404 }) };
  return { admin, contest: contest as { id: string; contest_type: string; org_id: string } };
}

/** Edit a group contest. Boxes reconfigures the grid/games/pot; other types
 *  (Pick'em) take a generic contest-level update (status, payout splits, name). */
export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // ── Non-Boxes (Pick'em, …): generic column update ──
  if (g.contest.contest_type !== "boxes") {
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v;
    if ("name" in patch) {
      const name = String(patch.name || "").trim();
      if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
      patch.name = name;
    }
    if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    patch.updated_at = new Date().toISOString();
    const { error } = await g.admin.from("v2_contests").update(patch).eq("id", contestId).eq("org_id", orgId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  // ── Boxes: reconfigure the pool ──
  const b = body as {
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

  const name = b.name != null ? b.name.trim() : undefined;
  if (name != null && !name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
  const cellCostCents = Number.isFinite(b.cell_cost_cents) ? Math.max(0, Math.round(b.cell_cost_cents as number)) : undefined;
  const potAllocation =
    b.pot_allocation === "equal" || b.pot_allocation === "round_weighted" || b.pot_allocation === "custom" ? b.pot_allocation : undefined;

  let games: BoxesGameInput[] | undefined;
  if (Array.isArray(b.games)) {
    if (b.games.length === 0) return NextResponse.json({ error: "Keep at least one game" }, { status: 400 });
    for (const x of b.games) {
      if (!x.espnEventId || !x.league || !x.teamRow || !x.teamCol) {
        return NextResponse.json({ error: "Each game needs a league, an ESPN id, and both teams" }, { status: 400 });
      }
    }
    games = b.games;
  }

  const periodWeights = b.period_weights && typeof b.period_weights === "object" ? b.period_weights : undefined;
  const maxSquaresPrimary = Number.isFinite(b.max_squares_primary) ? Math.max(1, Math.round(b.max_squares_primary as number)) : undefined;
  const maxSquaresSecondary =
    "max_squares_secondary" in b ? (b.max_squares_secondary == null ? null : Math.max(1, Math.round(b.max_squares_secondary))) : undefined;

  try {
    await updateBoxesContest(g.admin, contestId, {
      name,
      cellCostCents,
      potAllocation,
      periodWeights,
      maxSquaresPrimary,
      maxSquaresSecondary,
      primaryEndsAt: "primary_ends_at" in b ? b.primary_ends_at ?? null : undefined,
      secondaryEndsAt: "secondary_ends_at" in b ? b.secondary_ends_at ?? null : undefined,
      games,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}

/** Delete a group contest (Boxes cascades to its games + squares; others cascade their own rows). */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  const { error } = await g.admin.from("v2_contests").delete().eq("id", contestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
