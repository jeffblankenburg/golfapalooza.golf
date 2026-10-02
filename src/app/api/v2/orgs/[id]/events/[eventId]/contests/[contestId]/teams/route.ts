import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";

/**
 * Scramble teams (#209, Phase 2a). GET lists teams + member ids (any member).
 * PUT (admins) replaces the whole team set for a contest in one shot — the teams
 * screen manages state client-side and saves it here. Members must be enrolled
 * participants; a player lands on at most one team.
 *
 * NOTE: PUT replaces (delete + recreate), which cascades hole scores. That's fine
 * during team-building (2a); the scoring phase will switch to a diff-based save so
 * roster tweaks don't wipe entered scores.
 */

const TEAM_SELECT = "id, name, team_handicap, tee_time, starting_hole, sort_order, needs_attention_at";

async function loadTeams(admin: ReturnType<typeof v2AdminClient>, contestId: string) {
  const { data: teams } = await admin
    .from("v2_scramble_teams").select(TEAM_SELECT).eq("contest_id", contestId).order("sort_order");
  const ids = (teams || []).map((t) => t.id);
  const { data: members } = ids.length
    ? await admin.from("v2_scramble_team_members").select("team_id, user_id").in("team_id", ids)
    : { data: [] as { team_id: string; user_id: string }[] };
  const byTeam = new Map<string, string[]>();
  for (const m of members || []) (byTeam.get(m.team_id) || byTeam.set(m.team_id, []).get(m.team_id)!).push(m.user_id);
  return (teams || []).map((t) => ({ ...t, members: byTeam.get(t.id) || [] }));
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, contestId } = await params;
  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });
  return NextResponse.json({ teams: await loadTeams(admin, contestId) });
}

interface TeamInput {
  name?: string | null;
  team_handicap?: number | null;
  tee_time?: string | null;
  starting_hole?: number | null;
  members?: string[];
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string; eventId: string; contestId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId, contestId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  // Contest must belong to this org/event.
  const { data: contest } = await admin
    .from("v2_contests").select("id").eq("id", contestId).eq("org_id", orgId).eq("event_id", eventId).maybeSingle();
  if (!contest) return NextResponse.json({ error: "Contest not found" }, { status: 404 });

  let body: { teams?: TeamInput[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const teamsIn = Array.isArray(body.teams) ? body.teams : [];

  // Members must be enrolled participants; each player on at most one team.
  const { data: parts } = await admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId);
  const valid = new Set((parts || []).map((p) => p.user_id as string));
  const used = new Set<string>();
  const time = (t?: string | null) => (typeof t === "string" && /^\d{2}:\d{2}/.test(t) ? t.slice(0, 5) : null);

  // Replace: drop existing teams (cascades members + scores), then recreate.
  await admin.from("v2_scramble_teams").delete().eq("contest_id", contestId);

  const teamRows = teamsIn.map((t, i) => ({
    contest_id: contestId,
    name: (t.name || "").trim() || null,
    team_handicap: typeof t.team_handicap === "number" ? t.team_handicap : null,
    tee_time: time(t.tee_time),
    starting_hole: typeof t.starting_hole === "number" ? t.starting_hole : null,
    sort_order: i,
  }));
  if (teamRows.length === 0) return NextResponse.json({ teams: [] });

  const { data: created, error: teamErr } = await admin.from("v2_scramble_teams").insert(teamRows).select(TEAM_SELECT);
  if (teamErr) return NextResponse.json({ error: teamErr.message }, { status: 500 });

  const memberRows: { team_id: string; user_id: string }[] = [];
  (created || []).forEach((team, i) => {
    for (const uid of teamsIn[i].members || []) {
      if (valid.has(uid) && !used.has(uid)) {
        used.add(uid);
        memberRows.push({ team_id: team.id, user_id: uid });
      }
    }
  });
  if (memberRows.length) {
    const { error: memErr } = await admin.from("v2_scramble_team_members").insert(memberRows);
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 });
  }

  return NextResponse.json({ teams: await loadTeams(admin, contestId) });
}
