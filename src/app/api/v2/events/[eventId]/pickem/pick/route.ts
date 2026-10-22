import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { v2Now } from "@/lib/v2/simulator";
import { submitPick } from "@/lib/v2/contests/pickem-server";

/**
 * Save one Pick'em pick (#209). Members pick a side per game (and the total on the
 * tiebreaker game). Blocked once the slate locks (earliest kickoff). Self only.
 *
 * Thin shell: this (event-scoped) route resolves the contest + verifies the
 * member is on the EVENT roster, then hands off to the shared Pick'em engine.
 * A group-scoped shell will differ only in the eligibility check.
 */
export async function POST(request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { gameId?: string; pickedTeam?: "away" | "home" | null; tiebreakerTotal?: number | null };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const admin = v2AdminClient();
  const { data: game } = await admin.from("v2_pickem_games").select("id, contest_id").eq("id", body.gameId).maybeSingle();
  if (!game) return NextResponse.json({ error: "Game not found" }, { status: 404 });

  const { data: contest } = await admin.from("v2_contests").select("id, org_id, event_id, status").eq("id", game.contest_id).maybeSingle();
  if (!contest || contest.event_id !== eventId) return NextResponse.json({ error: "Contest not found" }, { status: 404 });
  if (!(await isOrgMember(admin, userId, contest.org_id as string))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const r = await submitPick(admin, contest.id as string, userId, body, await v2Now(), contest.status as string);
  return r.ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: r.error }, { status: r.status });
}
