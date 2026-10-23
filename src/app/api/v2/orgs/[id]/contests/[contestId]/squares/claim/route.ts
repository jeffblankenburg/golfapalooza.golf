import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

type Params = Promise<{ id: string; contestId: string }>;

/**
 * Members claim / release Squares squares (#230). Buying is open only in the
 * primary or secondary draft phase, and is capped per person (primary vs
 * secondary limits). Ownership is contest-level (one square = every game).
 */
export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Members only" }, { status: 403 });

  const { data: contest } = await admin
    .from("v2_contests")
    .select("id, contest_type, config")
    .eq("id", contestId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!contest || contest.contest_type !== "squares") return NextResponse.json({ error: "Squares pool not found" }, { status: 404 });

  let body: { action?: string; row?: number; col?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { action, row, col } = body;
  if (!Number.isInteger(row) || !Number.isInteger(col) || row! < 0 || row! > 9 || col! < 0 || col! > 9) {
    return NextResponse.json({ error: "Bad square" }, { status: 400 });
  }

  const cfg = (contest.config as Record<string, unknown>) ?? {};
  const phase = (cfg.phase as string) ?? "setup";
  if (phase !== "primary" && phase !== "secondary") {
    return NextResponse.json({ error: "The draft isn't open." }, { status: 409 });
  }

  const { data: cell } = await admin
    .from("v2_squares_cells")
    .select("id, user_id")
    .eq("contest_id", contestId)
    .eq("grid_row", row)
    .eq("grid_col", col)
    .maybeSingle();
  if (!cell) return NextResponse.json({ error: "Square not found" }, { status: 404 });

  if (action === "release") {
    if (cell.user_id !== userId) return NextResponse.json({ error: "Not your square" }, { status: 403 });
    const { error } = await admin.from("v2_squares_cells").update({ user_id: null, purchased_at: null }).eq("id", cell.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, owner: null });
  }

  // claim
  if (cell.user_id) return NextResponse.json({ error: "That square's taken." }, { status: 409 });

  const { count } = await admin
    .from("v2_squares_cells")
    .select("id", { count: "exact", head: true })
    .eq("contest_id", contestId)
    .eq("user_id", userId);
  const owned = count ?? 0;
  const cap = phase === "primary" ? (cfg.max_squares_primary as number) ?? 10 : (cfg.max_squares_secondary as number | null);
  if (cap != null && owned >= cap) {
    return NextResponse.json({ error: `You're at your limit of ${cap} square${cap === 1 ? "" : "s"} for this round.` }, { status: 403 });
  }

  const { error } = await admin
    .from("v2_squares_cells")
    .update({ user_id: userId, purchased_at: new Date().toISOString() })
    .eq("id", cell.id)
    .is("user_id", null); // guard against a race
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, owner: userId });
}
