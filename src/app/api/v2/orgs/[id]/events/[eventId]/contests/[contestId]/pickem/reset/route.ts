import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

/** Reset Pick'em (#209): clear everyone's picks. Game slate + results stay. Admins only. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; contestId: string }> }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: contest } = await admin.from("v2_contests").select("id, contest_type").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "pickem") return NextResponse.json({ error: "Not a Pick'em contest" }, { status: 404 });

  const { data: games } = await admin.from("v2_pickem_games").select("id").eq("contest_id", contestId);
  const gameIds = (games || []).map((g) => g.id as string);
  if (gameIds.length) {
    const { error } = await admin.from("v2_pickem_picks").delete().in("game_id", gameIds);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
