import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { v2Now } from "@/lib/v2/simulator";
import { submitPick } from "@/lib/v2/contests/pickem-server";
import { addContestParticipants } from "@/lib/v2/contests/enrollment";

/**
 * Save one Pick'em pick — GROUP-scoped (event_id NULL). Thin shell: eligibility
 * is "any org member" (the group lane's opt-in model), vs. the event lane's
 * roster check. The engine (open/lock rules + upsert) is identical.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; contestId: string }> }) {
  const { id: orgId, contestId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { gameId?: string; pickedTeam?: "away" | "home" | null; tiebreakerTotal?: number | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }

  const admin = v2AdminClient();
  const { data: contest } = await admin.from("v2_contests").select("id, org_id, contest_type, status").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "pickem") return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const r = await submitPick(admin, contestId, userId, body, await v2Now(), contest.status as string);
  // Making a pick IS entering the pool (the group lane's opt-in) — enroll them so
  // the buy-in obligation + the collector's paid-roster see them. Idempotent.
  if (r.ok) await addContestParticipants(admin, contestId, [userId]).catch(() => {});
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
