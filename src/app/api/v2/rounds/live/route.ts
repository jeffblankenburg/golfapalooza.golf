import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { pickName, type NameMode } from "@/lib/v2/profile";

/**
 * GET /api/v2/rounds/live?roundId=<current> — other groups playing the SAME
 * course right now (concurrent tee times / a small outing). Returns the sibling
 * in-progress rounds (same org, course, and date), each with its player names and
 * how many holes it's thru, for the live scorer's "other groups" accordions (#…).
 * Each group's full card is fetched on expand via /rounds/[id]/public.
 */
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const roundId = url.searchParams.get("roundId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!roundId) return NextResponse.json({ error: "roundId required" }, { status: 400 });

  const admin = v2AdminClient();
  const { data: cur } = await admin
    .from("v2_rounds")
    .select("org_id, course_id, round_date")
    .eq("id", roundId)
    .maybeSingle();
  if (!cur?.course_id) return NextResponse.json({ groups: [] });

  const org = cur.org_id
    ? one((await admin.from("v2_organizations").select("name_display").eq("id", cur.org_id).maybeSingle()).data)
    : null;
  const nameMode: NameMode = (org?.name_display as NameMode) || "nickname";

  let q = admin
    .from("v2_rounds")
    .select(
      "id, created_at, players:v2_round_players(user_id, guest_name, player_position, profile:v2_profiles(display_name, first_name, last_name, nickname))",
    )
    .eq("course_id", cur.course_id)
    .eq("status", "in_progress")
    .neq("id", roundId)
    .order("created_at", { ascending: true });
  if (cur.org_id) q = q.eq("org_id", cur.org_id);
  if (cur.round_date) q = q.eq("round_date", cur.round_date);
  const { data: sibs } = await q;
  if (!sibs?.length) return NextResponse.json({ groups: [] });

  // "Thru N" = distinct holes any player in the group has a score on.
  const ids = sibs.map((s) => s.id);
  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_id, hole_number, strokes")
    .in("round_id", ids);
  const holesByRound = new Map<string, Set<number>>();
  for (const s of scoreRows || []) {
    if (s.strokes == null) continue;
    const set = holesByRound.get(s.round_id) || new Set<number>();
    set.add(s.hole_number);
    holesByRound.set(s.round_id, set);
  }

  const groups = sibs.map((s) => ({
    id: s.id,
    players: (s.players || []).map((p) =>
      p.user_id ? (one(p.profile) ? pickName(one(p.profile)!, nameMode) : "Player") : p.guest_name || "Guest",
    ),
    thru: holesByRound.get(s.id)?.size ?? 0,
  }));

  return NextResponse.json({ groups });
}
