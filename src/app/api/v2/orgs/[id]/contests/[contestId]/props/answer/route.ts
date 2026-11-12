import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { v2Now } from "@/lib/v2/simulator";
import { submitAnswer } from "@/lib/v2/contests/props-server";
import { addContestParticipants } from "@/lib/v2/contests/enrollment";

/**
 * Save one member Props answer. Eligibility is "any org member" (the group lane's opt-in
 * model); answering enrolls them so the buy-in obligation + the collector's paid roster
 * see them (idempotent). The engine (open/lock rules + upsert) is scope-agnostic.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; contestId: string }> }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { questionId?: string; choice?: string | null; number?: number | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const admin = v2AdminClient();
  const { data: contest } = await admin.from("v2_contests").select("id, contest_type, status").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "props") return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const r = await submitAnswer(admin, contestId, userId, body, await v2Now(), contest.status as string);
  if (r.ok) await addContestParticipants(admin, contestId, [userId]).catch(() => {});
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
