import { NextResponse } from "next/server";
import { v2AdminClient } from "@/lib/v2/supabase";
import { formatCourseName } from "@/lib/v2/course-display";
import { pickName, type NameMode } from "@/lib/v2/profile";

/**
 * GET /api/v2/rounds/[id]/public — read-only scorecard for the PUBLIC watch page
 * (#205). No auth: served via the admin client so we never open the round tables
 * to the anon DB role. Names are resolved server-side (org name mode). Returns the
 * shape RoundScorecard consumes, plus header + live status for polling.
 */
export const dynamic = "force-dynamic";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function shortOf(name: string): string {
  const first = name.trim().split(/\s+/)[0] || name;
  return first.length > 8 ? first.slice(0, 8) : first;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = v2AdminClient();

  const { data: round } = await admin
    .from("v2_rounds")
    .select(
      `id, org_id, round_date, round_type, format, status,
       course:v2_courses(name, club_name),
       players:v2_round_players(id, user_id, guest_name, tee_id, player_position, final_gross_score,
         profile:v2_profiles(display_name, first_name, last_name, nickname, avatar_url),
         pt:v2_course_tees!v2_round_players_tee_id_fkey(tee_color))`,
    )
    .eq("id", id)
    .order("player_position", { referencedTable: "players", ascending: true })
    .maybeSingle();
  if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const org = round.org_id
    ? one((await admin.from("v2_organizations").select("name, name_display").eq("id", round.org_id).maybeSingle()).data)
    : null;
  const nameMode: NameMode = (org?.name_display as NameMode) || "nickname";

  const playerRows = round.players || [];
  const gridTeeId = playerRows[0]?.tee_id ?? null;
  const inNine = (h: number) => (round.round_type === "9-front" ? h <= 9 : round.round_type === "9-back" ? h >= 10 : true);

  const { data: holeRows } = gridTeeId
    ? await admin
        .from("v2_course_holes")
        .select("hole_number, par, handicap_index, yards")
        .eq("tee_id", gridTeeId)
        .order("hole_number", { ascending: true })
    : { data: [] };
  const holes = (holeRows || [])
    .filter((h) => inNine(h.hole_number))
    .map((h) => ({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index ?? null, yards: h.yards ?? null }));
  const parTotal = holes.reduce((s, h) => s + h.par, 0);

  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_player_id, hole_number, strokes, putts, fairway_hit, green_in_regulation, penalty_strokes")
    .eq("round_id", id);
  const scoresByPlayer = new Map<string, Record<number, number>>();
  type Agg = { puttsSum: number; puttsN: number; firHit: number; firN: number; girHit: number; girN: number; pen: number };
  const aggByPlayer = new Map<string, Agg>();
  for (const s of scoreRows || []) {
    if (!inNine(s.hole_number)) continue;
    const m = scoresByPlayer.get(s.round_player_id) || {};
    if (s.strokes != null) m[s.hole_number] = s.strokes;
    scoresByPlayer.set(s.round_player_id, m);
    const a = aggByPlayer.get(s.round_player_id) || { puttsSum: 0, puttsN: 0, firHit: 0, firN: 0, girHit: 0, girN: 0, pen: 0 };
    if (s.putts != null) { a.puttsSum += s.putts; a.puttsN += 1; }
    if (s.fairway_hit != null) { a.firN += 1; if (s.fairway_hit) a.firHit += 1; }
    if (s.green_in_regulation != null) { a.girN += 1; if (s.green_in_regulation) a.girHit += 1; }
    if (s.penalty_strokes) a.pen += s.penalty_strokes;
    aggByPlayer.set(s.round_player_id, a);
  }

  const isCompleted = round.status === "completed";
  const players = playerRows.map((p) => {
    const prof = one(p.profile);
    const name = p.user_id ? (prof ? pickName(prof, nameMode) : "Player") : p.guest_name || "Guest";
    const scores = scoresByPlayer.get(p.id) || {};
    const played = holes.filter((h) => scores[h.hole_number] != null);
    const grossSum = played.reduce((s, h) => s + scores[h.hole_number], 0);
    const parPlayed = played.reduce((s, h) => s + h.par, 0);
    const gross = p.final_gross_score ?? (grossSum > 0 ? grossSum : null);
    // In progress: to-par is relative to holes PLAYED (a running "thru X").
    // Completed: relative to the full round.
    const to_par = isCompleted ? (gross != null ? gross - parTotal : null) : played.length ? grossSum - parPlayed : null;
    const a = aggByPlayer.get(p.id);
    return {
      name,
      shortLabel: shortOf(name),
      is_viewer: false,
      is_guest: !p.user_id,
      tee_color: one(p.pt)?.tee_color ?? null,
      gross,
      to_par,
      scores,
      stats: {
        putts: a && a.puttsN > 0 ? a.puttsSum : null,
        fairways: a && a.firN > 0 ? { hit: a.firHit, of: a.firN } : null,
        gir: a && a.girN > 0 ? { hit: a.girHit, of: a.girN } : null,
        penalties: a && a.pen > 0 ? a.pen : null,
      },
    };
  });

  const isScramble = round.format === "scramble";
  const teamNames = isScramble
    ? playerRows.map((p) => {
        const prof = one(p.profile);
        const n = p.user_id ? (prof ? pickName(prof, nameMode) : "Player") : p.guest_name || "Guest";
        return p.user_id ? n : `${n} (guest)`;
      })
    : [];

  const course = one(round.course);
  const [y, m, dd] = (round.round_date || "").split("-").map(Number);
  const dateText = y ? new Date(y, (m || 1) - 1, dd || 1).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  return NextResponse.json({
    id: round.id,
    status: round.status,
    roundType: round.round_type,
    isScramble,
    orgName: org?.name ?? null,
    courseName: course ? formatCourseName(course) : "Round",
    dateText,
    holes,
    players,
    teamNames,
  });
}
