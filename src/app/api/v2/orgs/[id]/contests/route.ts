import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { createSquaresContest, type SquaresGameInput } from "@/lib/v2/contests/squares-server";
import { createPickem } from "@/lib/v2/contests/pickem-server";

type Params = Promise<{ id: string }>;

/**
 * Group-scoped contests (#231) — contests that belong to the org directly
 * (event_id NULL), available to all members, beside the single active event.
 * Today this creates Squares pools (#230); other group contest types slot in here.
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: {
    contest_type?: string;
    event_id?: string | null; // set → event-scoped Squares pool; omitted → group-scoped
    name?: string;
    cell_cost_cents?: number;
    pot_allocation?: string;
    period_weights?: Record<string, Record<string, number>>;
    max_squares_primary?: number;
    max_squares_secondary?: number | null;
    primary_ends_at?: string | null;
    secondary_ends_at?: string | null;
    games?: SquaresGameInput[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  // Pick'em: group-scoped (event_id NULL). Starts as an empty draft; the admin
  // builds the slate on the manage page afterward, so create needs only a name.
  if (body.contest_type === "pickem") {
    const pickemName = (body.name || "").trim();
    if (!pickemName) return NextResponse.json({ error: "Name is required" }, { status: 400 });
    try {
      const { id } = await createPickem(admin, { orgId, eventId: null, name: pickemName, createdBy: userId });
      return NextResponse.json({ id });
    } catch (e) {
      return NextResponse.json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 500 });
    }
  }

  if (body.contest_type !== "squares") {
    return NextResponse.json({ error: "Only squares and pickem contests are supported here for now" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  const cellCostCents = Number.isFinite(body.cell_cost_cents) ? Math.max(0, Math.round(body.cell_cost_cents as number)) : 0;
  const potAllocation = body.pot_allocation === "round_weighted" || body.pot_allocation === "custom" ? body.pot_allocation : "equal";
  const games = Array.isArray(body.games) ? body.games : [];
  if (games.length === 0) return NextResponse.json({ error: "Pick at least one game" }, { status: 400 });
  for (const g of games) {
    if (!g.espnEventId || !g.league || !g.teamRow || !g.teamCol) {
      return NextResponse.json({ error: "Each game needs a league, an ESPN id, and both teams" }, { status: 400 });
    }
  }

  const periodWeights = body.period_weights && typeof body.period_weights === "object" ? body.period_weights : undefined;
  const maxSquaresPrimary = Number.isFinite(body.max_squares_primary) ? Math.max(1, Math.round(body.max_squares_primary as number)) : 10;
  const maxSquaresSecondary =
    body.max_squares_secondary == null ? null : Math.max(1, Math.round(body.max_squares_secondary));

  try {
    const { id } = await createSquaresContest(admin, {
      orgId,
      eventId: typeof body.event_id === "string" ? body.event_id : null,
      name,
      cellCostCents,
      potAllocation,
      periodWeights,
      maxSquaresPrimary,
      maxSquaresSecondary,
      primaryEndsAt: body.primary_ends_at ?? null,
      secondaryEndsAt: body.secondary_ends_at ?? null,
      games,
      createdBy: userId,
    });
    return NextResponse.json({ id });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Create failed" }, { status: 500 });
  }
}
