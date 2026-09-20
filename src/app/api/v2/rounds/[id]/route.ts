import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { formatCourseName } from "@/lib/v2/course-display";
import { expectedHoleCount, isRoundIncomplete } from "@/lib/rounds/incomplete";
import { recalculateHandicap } from "@/lib/v2/golf/handicap";
import { clearRoundActivity } from "@/lib/v2/rounds/round-activity";

/**
 * GET /api/v2/rounds/[id] — one round's detail for the in-drawer scorecard: a
 * shared par row + EVERY player's hole-by-hole scores (the viewer's is flagged
 * so the UI can highlight it), plus the viewer's gross/adjusted/differential.
 * Personal & global — any authed user can read a round.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

  const { data: round } = await admin
    .from("v2_rounds")
    .select(
      `id, round_date, round_type, format, status,
       course:v2_courses(name, club_name),
       tee:v2_course_tees(tee_name, tee_color, gender, course_rating, slope_rating, par),
       players:v2_round_players(
         id, user_id, guest_name, tee_id, player_position,
         final_gross_score, final_adjusted_score, score_differential,
         profile:v2_profiles(display_name, first_name, last_name, nickname, avatar_url)
       )`,
    )
    .eq("id", id)
    .order("player_position", { referencedTable: "players", ascending: true })
    .maybeSingle();

  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const playerRows = round.players || [];
  const viewer = playerRows.find((p) => p.user_id === userId) || playerRows[0] || null;
  const course = one(round.course);
  const roundTee = one(round.tee);

  // Comment count for the collapsed "Comments (N)" toggle in the detail view.
  const { count: commentCount } = await admin
    .from("v2_round_comments")
    .select("id", { count: "exact", head: true })
    .eq("round_id", id);

  // The holes that belong to this round's nine (front 1–9, back 10–18, all 18).
  const inNine = (h: number) =>
    round.round_type === "9-front" ? h <= 9 : round.round_type === "9-back" ? h >= 10 : true;

  // Shared par row from the viewer's tee (composition-tee resolution is a TODO).
  const gridTeeId = viewer?.tee_id ?? null;
  const { data: holeRows } = gridTeeId
    ? await admin
        .from("v2_course_holes")
        .select("hole_number, par, handicap_index")
        .eq("tee_id", gridTeeId)
        .order("hole_number", { ascending: true })
    : { data: [] };
  const holes = (holeRows || [])
    .filter((h) => inNine(h.hole_number))
    .map((h) => ({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index }));

  // Every player's hole scores for this round, grouped by player.
  const { data: scoreRows } = await admin
    .from("v2_round_scores")
    .select("round_player_id, hole_number, strokes")
    .eq("round_id", id);
  const scoresByPlayer = new Map<string, Record<number, number>>();
  for (const s of scoreRows || []) {
    if (!inNine(s.hole_number)) continue;
    const m = scoresByPlayer.get(s.round_player_id) || {};
    if (s.strokes != null) m[s.hole_number] = s.strokes;
    scoresByPlayer.set(s.round_player_id, m);
  }

  const teePar = roundTee?.par ?? 72;
  const parFromHoles = holes.reduce((sum, h) => sum + h.par, 0);
  const par = parFromHoles || (round.round_type === "18" ? teePar : Math.round(teePar / 2));

  const viewerGross = viewer?.final_gross_score ?? null;
  const viewerHolesPlayed = Object.keys(scoresByPlayer.get(viewer?.id ?? "") || {}).length;
  const isIncomplete = isRoundIncomplete(round.round_type, viewerHolesPlayed, viewerGross != null);
  const viewerToPar = isIncomplete || viewerGross == null ? null : viewerGross - par;

  const players = playerRows.map((p) => {
    const scores = scoresByPlayer.get(p.id) || {};
    const gross = p.final_gross_score ?? null;
    const prof = one(p.profile);
    return {
      is_viewer: p.id === viewer?.id,
      is_guest: !p.user_id,
      guest_name: p.guest_name ?? null,
      profile: prof
        ? {
            display_name: prof.display_name,
            first_name: prof.first_name,
            last_name: prof.last_name,
            nickname: prof.nickname,
            avatar_url: prof.avatar_url,
          }
        : null,
      gross,
      to_par: gross != null ? gross - par : null,
      scores,
    };
  });

  return NextResponse.json({
    id: round.id,
    round_date: round.round_date,
    round_type: round.round_type,
    format: round.format,
    status: round.status,
    course_name: course ? formatCourseName(course) : "Unknown",
    tee_name: roundTee?.tee_name || "",
    tee_color: roundTee?.tee_color ?? null,
    tee_gender: roundTee?.gender ?? null,
    course_rating: roundTee?.course_rating ?? null,
    slope_rating: roundTee?.slope_rating ?? null,
    par,
    gross: viewerGross,
    adjusted: viewer?.final_adjusted_score ?? null,
    differential: viewer?.score_differential ?? null,
    to_par: viewerToPar,
    is_incomplete: isIncomplete,
    holes_played: viewerHolesPlayed,
    expected_holes: expectedHoleCount(round.round_type),
    comment_count: commentCount ?? 0,
    holes,
    players,
  });
}

/**
 * DELETE /api/v2/rounds/[id] — remove a round entirely (scores + roster cascade
 * via FK). Co-equal ownership: the creator or any player on the round may delete
 * it. Afterwards, recalc the handicap of every loozer who was on it, since a
 * completed round dropping out changes their best-8-of-20.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id } = await params;

  const admin = v2AdminClient();
  const { data: round } = await admin.from("v2_rounds").select("id, created_by, status").eq("id", id).maybeSingle();
  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const { data: roster } = await admin.from("v2_round_players").select("user_id").eq("round_id", id);
  const isPlayer = (roster || []).some((r) => r.user_id === userId);
  if (round.created_by !== userId && !isPlayer) {
    return NextResponse.json({ error: "Only players in this round can delete it" }, { status: 403 });
  }

  const loozerIds = [...new Set((roster || []).map((r) => r.user_id).filter((u): u is string => !!u))];
  const actorIsPlayer = loozerIds.includes(userId);
  const otherLoozers = loozerIds.filter((u) => u !== userId);

  // In-progress rounds delete wholesale (it's a live session). A completed round
  // shared with other Loozers only removes the actor's own score; the round is
  // deleted outright only when no other Loozer remains (solo, or the actor is the
  // last one out), or when a non-player creator deletes it.
  const deleteWhole = round.status === "in_progress" || !actorIsPlayer || otherLoozers.length === 0;

  if (deleteWhole) {
    const { error } = await admin.from("v2_rounds").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    await clearRoundActivity(admin, id);
    await Promise.all(loozerIds.map((uid) => recalculateHandicap(admin, uid)));
    return NextResponse.json({ ok: true, deletedRound: true });
  }

  // Remove only the actor: their round_player row (scores cascade) + their score
  // activity row; recalc just their handicap. The round stays for everyone else.
  const { error } = await admin.from("v2_round_players").delete().eq("round_id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("v2_activity").delete().eq("ref_id", id).eq("kind", "round").eq("actor_id", userId);
  await recalculateHandicap(admin, userId);
  return NextResponse.json({ ok: true, deletedRound: false });
}
