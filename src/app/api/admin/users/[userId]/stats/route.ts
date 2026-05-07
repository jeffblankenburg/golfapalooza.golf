import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/users/{userId}/stats:
 *   get:
 *     summary: Aggregate stats for a single user — scoring breakdown, accolades, engagement (admin)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Stats payload with scoring, accolades, and engagement sections.
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await checkAnyPermissionAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  const supabase = createAdminClient();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Pull every completed-round player row for this user, with scores + tee par lookup info
  const { data: players, error: playersError } = await supabase
    .from("round_players")
    .select(`
      id,
      tee_id,
      final_gross_score,
      score_differential,
      round:rounds!inner(id, status),
      scores:round_scores(hole_number, strokes)
    `)
    .eq("user_id", userId)
    .eq("round.status", "completed");

  if (playersError) {
    return NextResponse.json({ error: playersError.message }, { status: 500 });
  }

  const teeIds = [
    ...new Set(
      (players || [])
        .map((p) => p.tee_id)
        .filter((id): id is string => !!id)
    ),
  ];
  const parByTeeHole = new Map<string, number>();
  if (teeIds.length > 0) {
    const { data: holes } = await supabase
      .from("course_holes")
      .select("tee_id, hole_number, par")
      .in("tee_id", teeIds);
    for (const h of holes || []) {
      parByTeeHole.set(`${h.tee_id}:${h.hole_number}`, h.par);
    }
  }

  let eagles = 0;
  let birdies = 0;
  let pars = 0;
  let bogeys = 0;
  let doublePlus = 0;
  let scoredHoles = 0;
  let bestGross: number | null = null;
  let bestDifferential: number | null = null;
  const completedRounds = players?.length || 0;

  for (const p of players || []) {
    if (p.final_gross_score != null) {
      if (bestGross == null || p.final_gross_score < bestGross) bestGross = p.final_gross_score;
    }
    if (p.score_differential != null) {
      if (bestDifferential == null || p.score_differential < bestDifferential) {
        bestDifferential = p.score_differential;
      }
    }
    for (const s of p.scores || []) {
      if (!p.tee_id) continue;
      const par = parByTeeHole.get(`${p.tee_id}:${s.hole_number}`);
      if (par == null) continue;
      const diff = s.strokes - par;
      scoredHoles += 1;
      if (diff <= -2) eagles += 1;
      else if (diff === -1) birdies += 1;
      else if (diff === 0) pars += 1;
      else if (diff === 1) bogeys += 1;
      else doublePlus += 1;
    }
  }

  // Accolades grouped by category
  const { data: accolades } = await supabase
    .from("accolades")
    .select("category")
    .eq("user_id", userId);
  const accoladesByCategory: Record<string, number> = {};
  for (const a of accolades || []) {
    const cat = a.category || "custom";
    accoladesByCategory[cat] = (accoladesByCategory[cat] || 0) + 1;
  }
  const accoladesTotal = (accolades || []).length;

  // Engagement counts via parallel range queries (head:true so no rows are returned)
  const [pageViews30, chatMessages30, galleryUploads30, scoreSaves30, lastActivityRes] = await Promise.all([
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "page_view")
      .gte("created_at", since30),
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "chat_message")
      .gte("created_at", since30),
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "gallery_upload")
      .gte("created_at", since30),
    supabase
      .from("activity_log")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("event_type", "score_save")
      .gte("created_at", since30),
    supabase
      .from("activity_log")
      .select("created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const [songPlaysAll, songPlays30] = await Promise.all([
    supabase.from("song_plays").select("id", { count: "exact", head: true }).eq("user_id", userId),
    supabase
      .from("song_plays")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("played_at", since30),
  ]);

  const lastActivity = lastActivityRes.data?.[0]?.created_at || null;

  return NextResponse.json({
    scoring: {
      completed_rounds: completedRounds,
      best_gross: bestGross,
      best_differential: bestDifferential != null ? Number(bestDifferential.toFixed(1)) : null,
      scored_holes: scoredHoles,
      eagles_or_better: eagles,
      birdies,
      pars,
      bogeys,
      doubles_or_worse: doublePlus,
    },
    accolades: {
      total: accoladesTotal,
      by_category: accoladesByCategory,
    },
    engagement: {
      last_active: lastActivity,
      last_30_days: {
        page_views: pageViews30.count ?? 0,
        chat_messages: chatMessages30.count ?? 0,
        gallery_uploads: galleryUploads30.count ?? 0,
        score_saves: scoreSaves30.count ?? 0,
        song_plays: songPlays30.count ?? 0,
      },
      song_plays_all_time: songPlaysAll.count ?? 0,
    },
  });
}
