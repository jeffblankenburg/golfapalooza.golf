import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { v2Now } from "@/lib/v2/simulator";
import { isSlateLocked, type PickemGame } from "@/lib/v2/contests/pickem";

/**
 * Save one Pick'em pick (#209). Members pick a side per game (and the total on the
 * tiebreaker game). Blocked once the slate locks (earliest kickoff). Self only.
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
  if (contest.status !== "active") return NextResponse.json({ error: "Pick'em isn't open" }, { status: 403 });

  // Lock the whole slate at the earliest kickoff.
  const { data: games } = await admin.from("v2_pickem_games").select("game_time").eq("contest_id", game.contest_id);
  if (isSlateLocked((games || []) as PickemGame[], await v2Now())) {
    return NextResponse.json({ error: "Picks are locked" }, { status: 403 });
  }

  const picked = body.pickedTeam === "away" || body.pickedTeam === "home" ? body.pickedTeam : null;
  const tb = typeof body.tiebreakerTotal === "number" && body.tiebreakerTotal >= 0 ? Math.round(body.tiebreakerTotal) : null;
  const { error } = await admin.from("v2_pickem_picks").upsert(
    { game_id: body.gameId, user_id: userId, picked_team: picked, tiebreaker_total: tb, updated_at: new Date().toISOString() },
    { onConflict: "game_id,user_id" },
  );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
