import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isRoundIncomplete, expectedHoleCount } from "@/lib/rounds/incomplete";

/**
 * @swagger
 * /api/rounds/recent:
 *   get:
 *     summary: Recent completed rounds across all Loozers (home page feed)
 *     tags: [Rounds]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Max number of player-rounds to return (default 25, max 50)
 *     responses:
 *       200:
 *         description: One entry per (round, player) ordered newest first
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = parseInt(searchParams.get("limit") || "25", 10);
  const limit = Math.min(Math.max(limitParam, 1), 50);

  const adminClient = createAdminClient();

  // Pull more rounds than we ultimately need so that after we flatten
  // round_players and drop system/financial-only users, we still have
  // enough cards to fill `limit`.
  const { data: rounds, error } = await adminClient
    .from("rounds")
    .select(`
      id,
      round_type,
      round_date,
      completed_at,
      course:courses(id, name),
      round_players(
        id,
        user_id,
        tee_id,
        final_gross_score,
        user:users(id, display_name, avatar_url, is_system, is_financial_only),
        tee:course_tees(id, tee_name, tee_color, par)
      )
    `)
    .eq("status", "completed")
    // Scramble rounds are a single team ball — one card per member with an
    // identical gross would spam the feed, and it isn't a personal score.
    .eq("format", "individual")
    .order("round_date", { ascending: false })
    .order("completed_at", { ascending: false, nullsFirst: false })
    .order("player_position", { referencedTable: "round_players", ascending: true })
    .limit(Math.min(limit * 2, 50));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type Tee = { id: string; tee_name: string | null; tee_color: string | null; par: number | null };
  type User = { id: string; display_name: string; avatar_url: string | null; is_system: boolean; is_financial_only: boolean };
  type Player = {
    id: string;
    user_id: string;
    tee_id: string | null;
    final_gross_score: number | null;
    user: User | User[] | null;
    tee: Tee | Tee[] | null;
  };
  type Round = {
    id: string;
    round_type: string;
    round_date: string;
    completed_at: string | null;
    course: { id: string; name: string } | { id: string; name: string }[] | null;
    round_players: Player[];
  };

  const list = (rounds || []) as Round[];

  // Count scored holes per player so we can flag rounds set up for 18 (or 9)
  // that were only partially played — their gross is a sum of played holes.
  const feedPlayerIds = list.flatMap((r) =>
    (r.round_players || []).filter((p) => p.final_gross_score != null).map((p) => p.id),
  );
  const holesByPlayer = new Map<string, number>();
  if (feedPlayerIds.length > 0) {
    const { data: scoreRows } = await adminClient
      .from("round_scores")
      .select("round_player_id")
      .in("round_player_id", feedPlayerIds);
    for (const s of scoreRows || []) {
      holesByPlayer.set(s.round_player_id, (holesByPlayer.get(s.round_player_id) || 0) + 1);
    }
  }

  // 9-hole rounds need per-nine par, not the tee's 18-hole par. Batch fetch
  // course_holes for every distinct tee that backs a non-18 player.
  const nineHoleTeeIds = new Set<string>();
  for (const r of list) {
    if (r.round_type === "18") continue;
    for (const p of r.round_players || []) {
      if (p.tee_id) nineHoleTeeIds.add(p.tee_id);
    }
  }

  const nineHoleParByTee = new Map<string, { front: number; back: number }>();
  if (nineHoleTeeIds.size > 0) {
    const { data: holes } = await adminClient
      .from("course_holes")
      .select("tee_id, hole_number, par")
      .in("tee_id", [...nineHoleTeeIds]);
    for (const h of holes || []) {
      const entry = nineHoleParByTee.get(h.tee_id) || { front: 0, back: 0 };
      if (h.hole_number <= 9) entry.front += h.par;
      else entry.back += h.par;
      nineHoleParByTee.set(h.tee_id, entry);
    }
  }

  const cards: {
    round_id: string;
    round_player_id: string;
    round_type: string;
    round_date: string;
    completed_at: string | null;
    player: { id: string; display_name: string; avatar_url: string | null };
    course_name: string;
    tee_name: string | null;
    tee_color: string | null;
    gross_score: number;
    par: number;
    score_to_par: number;
    is_incomplete: boolean;
    holes_played: number;
    expected_holes: number;
  }[] = [];

  for (const r of list) {
    const course = r.course
      ? (Array.isArray(r.course) ? r.course[0] : r.course)
      : null;

    for (const p of r.round_players || []) {
      const u = p.user ? (Array.isArray(p.user) ? p.user[0] : p.user) : null;
      if (!u || u.is_system || u.is_financial_only) continue;
      if (p.final_gross_score == null) continue;

      const tee = p.tee ? (Array.isArray(p.tee) ? p.tee[0] : p.tee) : null;
      const teePar = tee?.par ?? 72;

      let par = teePar;
      if (r.round_type !== "18" && p.tee_id) {
        const split = nineHoleParByTee.get(p.tee_id);
        if (split) {
          par = r.round_type === "9-back" ? split.back : split.front;
        } else {
          par = Math.round(teePar / 2);
        }
      }

      const gross = p.final_gross_score;
      const holesPlayed = holesByPlayer.get(p.id) || 0;
      cards.push({
        round_id: r.id,
        round_player_id: p.id,
        round_type: r.round_type,
        round_date: r.round_date,
        completed_at: r.completed_at,
        player: { id: u.id, display_name: u.display_name, avatar_url: u.avatar_url },
        course_name: course?.name || "Unknown",
        tee_name: tee?.tee_name || null,
        tee_color: tee?.tee_color || null,
        gross_score: gross,
        par,
        score_to_par: gross - par,
        is_incomplete: isRoundIncomplete(r.round_type, holesPlayed, gross != null),
        holes_played: holesPlayed,
        expected_holes: expectedHoleCount(r.round_type),
      });

      if (cards.length >= limit) break;
    }
    if (cards.length >= limit) break;
  }

  return NextResponse.json({ rounds: cards });
}
