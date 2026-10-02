import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { resolveContestHoles } from "@/lib/v2/contests/holes";

/**
 * Scramble scoring (#209, Phase 2a slice 2). GET loads everything the scorecard
 * needs (holes+par, teams+members, team hole scores, per-player green/holed
 * observations). PUT saves ONE team's ONE hole — the review scorecard's per-hole
 * edit — writing strokes to v2_scramble_hole_scores and green/holed to
 * v2_contest_observations. Reads: any member. Writes: org admins.
 */

export async function GET(request: Request, { params }: { params: Promise<{ id: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data: contest } = await admin.from("v2_contests").select("id, tee_id, config").eq("id", contestId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const holes = await resolveContestHoles(admin, contest as { tee_id: string | null; config: Record<string, unknown> | null });

  const { data: teams } = await admin
    .from("v2_scramble_teams").select("id, name, team_handicap, sort_order").eq("contest_id", contestId).order("sort_order");
  const teamIds = (teams || []).map((t) => t.id);
  const [{ data: members }, { data: scores }, { data: obs }] = await Promise.all([
    teamIds.length ? admin.from("v2_scramble_team_members").select("team_id, user_id").in("team_id", teamIds) : Promise.resolve({ data: [] as { team_id: string; user_id: string }[] }),
    teamIds.length ? admin.from("v2_scramble_hole_scores").select("team_id, hole_number, strokes").in("team_id", teamIds) : Promise.resolve({ data: [] as { team_id: string; hole_number: number; strokes: number }[] }),
    admin.from("v2_contest_observations").select("user_id, hole_number, metric, value").eq("contest_id", contestId),
  ]);
  const membersByTeam = new Map<string, string[]>();
  for (const m of members || []) (membersByTeam.get(m.team_id) || membersByTeam.set(m.team_id, []).get(m.team_id)!).push(m.user_id);

  return NextResponse.json({
    holes,
    teams: (teams || []).map((t) => ({ id: t.id, name: t.name, team_handicap: t.team_handicap, members: membersByTeam.get(t.id) || [] })),
    scores: scores || [],
    observations: obs || [],
  });
}

interface Obs { user_id: string; on_green?: boolean; holed_out?: boolean }

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  const { data: contest } = await admin.from("v2_contests").select("id, event_id").eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

  let body: { team_id?: string; hole_number?: number; strokes?: number | null; observations?: Obs[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const teamId = body.team_id;
  const hole = body.hole_number;
  if (!teamId || typeof hole !== "number" || hole < 1 || hole > 18) {
    return NextResponse.json({ error: "team_id and a valid hole_number are required" }, { status: 400 });
  }

  // Team must belong to this contest.
  const { data: team } = await admin.from("v2_scramble_teams").select("id, contest_id").eq("id", teamId).maybeSingle();
  if (!team || team.contest_id !== contestId) return NextResponse.json({ error: "Team not in this contest" }, { status: 400 });
  const { data: memRows } = await admin.from("v2_scramble_team_members").select("user_id").eq("team_id", teamId);
  const memberIds = (memRows || []).map((m) => m.user_id as string);

  // Strokes: upsert a valid score, or clear the hole.
  const strokes = body.strokes;
  if (typeof strokes === "number" && strokes >= 1 && strokes <= 20) {
    const { error } = await admin.from("v2_scramble_hole_scores").upsert({ team_id: teamId, hole_number: hole, strokes }, { onConflict: "team_id,hole_number" });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    await admin.from("v2_scramble_hole_scores").delete().eq("team_id", teamId).eq("hole_number", hole);
  }

  // Observations: replace green/holed for this hole across the team's members.
  if (memberIds.length) {
    await admin.from("v2_contest_observations").delete()
      .eq("contest_id", contestId).eq("hole_number", hole).in("user_id", memberIds).in("metric", ["on_green", "holed_out"]);
    const rows: { event_id: string; contest_id: string; user_id: string; hole_number: number; metric: string; value: number }[] = [];
    for (const o of body.observations || []) {
      if (!memberIds.includes(o.user_id)) continue;
      if (o.on_green) rows.push({ event_id: eventId, contest_id: contestId, user_id: o.user_id, hole_number: hole, metric: "on_green", value: 1 });
      if (o.holed_out) rows.push({ event_id: eventId, contest_id: contestId, user_id: o.user_id, hole_number: hole, metric: "holed_out", value: 1 });
    }
    if (rows.length) {
      const { error } = await admin.from("v2_contest_observations").insert(rows);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
