import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { formatCourseName } from "@/lib/v2/course-display";
import { expectedHoleCount, isRoundIncomplete } from "@/lib/rounds/incomplete";
import { recalculateHandicap } from "@/lib/v2/golf/handicap";
import { clearRoundActivity } from "@/lib/v2/rounds/round-activity";
import { calculateCourseHandicap, strokesReceivedOnHole } from "@/lib/v2/golf/calculator";

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
      `id, round_date, round_type, format, status, created_by,
       course:v2_courses(name, club_name),
       tee:v2_course_tees(tee_name, tee_color, gender, course_rating, slope_rating, par),
       players:v2_round_players(
         id, user_id, guest_name, tee_id, player_position,
         final_gross_score, final_adjusted_score, score_differential,
         profile:v2_profiles(display_name, first_name, last_name, nickname, avatar_url),
         pt:v2_course_tees!v2_round_players_tee_id_fkey(tee_color, course_rating, slope_rating, par)
       )`,
    )
    .eq("id", id)
    .order("player_position", { referencedTable: "players", ascending: true })
    .maybeSingle();

  if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });

  const playerRows = round.players || [];
  // The viewer's OWN player row — null for a non-player (spectator). No fallback:
  // a spectator must not be treated as a player (no "You" row, no manage actions).
  const viewer = playerRows.find((p) => p.user_id === userId) || null;
  // Whoever's tee drives the shared par grid (any player's tee works for par).
  const gridTee = viewer ?? playerRows[0] ?? null;
  // Can this viewer manage the round (resume / complete / delete)?
  const canManage = !!viewer || round.created_by === userId;
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

  // Shared par row from the grid tee (composition-tee resolution is a TODO).
  const gridTeeId = gridTee?.tee_id ?? null;
  const { data: holeRows } = gridTeeId
    ? await admin
        .from("v2_course_holes")
        .select("hole_number, par, handicap_index, yards")
        .eq("tee_id", gridTeeId)
        .order("hole_number", { ascending: true })
    : { data: [] };
  const holes = (holeRows || [])
    .filter((h) => inNine(h.hole_number))
    .map((h) => ({ hole_number: h.hole_number, par: h.par, handicap_index: h.handicap_index, yards: h.yards ?? null }));

  // Every player's hole scores for this round, grouped by player, plus per-player
  // trackable aggregates (putts / fairways / GIR / penalties).
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
    const a = aggByPlayer.get(p.id);
    const stats = {
      putts: a && a.puttsN > 0 ? a.puttsSum : null,
      fairways: a && a.firN > 0 ? { hit: a.firHit, of: a.firN } : null,
      gir: a && a.girN > 0 ? { hit: a.girHit, of: a.girN } : null,
      penalties: a && a.pen > 0 ? a.pen : null,
    };
    return {
      id: p.id,
      is_viewer: viewer ? p.id === viewer.id : false,
      is_guest: !p.user_id,
      guest_name: p.guest_name ?? null,
      tee_color: one(p.pt)?.tee_color ?? null,
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
      stats,
    };
  });

  // Side games + per-hole net strokes (played off the low) so the detail page can
  // show the final results by reusing the live standings renderer, read-only.
  const { data: gameRows } = await admin
    .from("v2_round_games")
    .select("id, game_type, is_net, participant_ids, config")
    .eq("round_id", id);
  const games = (gameRows || []).map((g) => ({
    id: g.id,
    game_type: g.game_type,
    is_net: g.is_net,
    participant_ids: g.participant_ids || [],
    value: typeof g.config?.value === "number" ? g.config.value : null,
    carry: g.config?.carry === true,
  }));

  const strokesByPlayer: Record<string, Record<number, number>> = {};
  if (games.length) {
    const uids = [...new Set(playerRows.map((p) => p.user_id).filter((u): u is string => !!u))];
    const { data: hcaps } = uids.length
      ? await admin.from("v2_player_handicaps").select("user_id, handicap_index").in("user_id", uids)
      : { data: [] };
    const hiByUser = new Map((hcaps || []).map((h) => [h.user_id, h.handicap_index]));
    const chById = new Map<string, number | null>();
    for (const p of playerRows) {
      const t = one(p.pt);
      const hi = p.user_id ? hiByUser.get(p.user_id) : null;
      chById.set(
        p.id,
        hi == null || t?.slope_rating == null || t?.course_rating == null
          ? null
          : calculateCourseHandicap(Number(hi), t.slope_rating, Number(t.course_rating), t.par ?? 72),
      );
    }
    const chVals = [...chById.values()].filter((v): v is number => v != null);
    const low = chVals.length ? Math.min(...chVals) : 0;
    for (const p of playerRows) {
      const ch = chById.get(p.id);
      if (ch == null) {
        strokesByPlayer[p.id] = {};
        continue;
      }
      const rel = ch - low;
      const m: Record<number, number> = {};
      for (const h of holes) m[h.hole_number] = strokesReceivedOnHole(h.handicap_index, rel);
      strokesByPlayer[p.id] = m;
    }
  }

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
    can_manage: canManage,
    holes,
    players,
    games,
    strokes_by_player: strokesByPlayer,
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

  // The actor's round_player id — grab it BEFORE the delete so we can scrub side
  // games (participant_ids is a UUID[], not an FK, so it won't clean up on its own).
  const { data: myRow } = await admin
    .from("v2_round_players")
    .select("id")
    .eq("round_id", id)
    .eq("user_id", userId)
    .maybeSingle();

  // Remove only the actor: their round_player row (scores cascade) + their score
  // activity row; recalc just their handicap. The round stays for everyone else.
  const { error } = await admin.from("v2_round_players").delete().eq("round_id", id).eq("user_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  await admin.from("v2_activity").delete().eq("ref_id", id).eq("kind", "round").eq("actor_id", userId);

  // Scrub the departed player from any side game: drop them from participant_ids,
  // and delete the game outright if it falls below its required roster size.
  if (myRow?.id) {
    const rpId = myRow.id;
    const { data: gameRows } = await admin
      .from("v2_round_games")
      .select("id, game_type, participant_ids")
      .eq("round_id", id);
    for (const g of gameRows || []) {
      const ids: string[] = g.participant_ids || [];
      if (!ids.includes(rpId)) continue;
      const remaining = ids.filter((x) => x !== rpId);
      const stillValid =
        g.game_type === "nassau"
          ? remaining.length === 2
          : g.game_type === "sixes" || g.game_type === "vegas"
            ? remaining.length === 4
            : remaining.length >= 2;
      if (stillValid) await admin.from("v2_round_games").update({ participant_ids: remaining }).eq("id", g.id);
      else await admin.from("v2_round_games").delete().eq("id", g.id);
    }
  }

  await recalculateHandicap(admin, userId);
  return NextResponse.json({ ok: true, deletedRound: false });
}
