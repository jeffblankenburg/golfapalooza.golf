import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

/**
 * Record the winner of a manually-adjudicated contest (#209) — CTP / Long Drive /
 * Long Putt. Single winner; writes to v2_contest_winners (the one source of truth).
 * body { user_id } sets the winner; { user_id: null } marks "explicitly no winner"
 * (declared_no_winner). Admins only.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: contest } = await admin
    .from("v2_contests").select("id").eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

  let body: { user_id?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const winnerId = typeof body.user_id === "string" && body.user_id ? body.user_id : null;

  // Replace any existing winner for this contest.
  await admin.from("v2_contest_winners").delete().eq("contest_id", contestId);
  if (winnerId) {
    const { error } = await admin.from("v2_contest_winners").insert({ contest_id: contestId, user_id: winnerId, place: 1, resolved_by: userId });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // declared_no_winner = true only when the admin explicitly says nobody won.
  await admin.from("v2_contests").update({ declared_no_winner: winnerId === null, updated_at: new Date().toISOString() }).eq("id", contestId);

  return NextResponse.json({ ok: true });
}
