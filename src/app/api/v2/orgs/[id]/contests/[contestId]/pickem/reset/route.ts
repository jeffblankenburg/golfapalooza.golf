import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { resetPicks } from "@/lib/v2/contests/pickem-server";

/** Reset a GROUP-scoped Pick'em: clear everyone's picks. Slate + results stay. Admins only. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; contestId: string }> }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: contest } = await admin.from("v2_contests").select("id, contest_type").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "pickem") return NextResponse.json({ error: "Not a Pick'em contest" }, { status: 404 });

  const r = await resetPicks(admin, contestId);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
