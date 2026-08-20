import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/rounds/live:
 *   get:
 *     summary: All in-progress individual rounds (home page "Live Now" list)
 *     tags: [Rounds]
 *     responses:
 *       200:
 *         description: One entry per in-progress individual round, newest first
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Both individual and personal scramble rounds are watchable here. (Event
  // scramble CONTESTS live in scramble_teams, not `rounds`, and keep their own
  // "Score Day X" home-page card — they never appear in this feed.)
  const { data: rounds, error } = await admin
    .from("rounds")
    .select(
      `
      id, round_type, format, created_at, created_by,
      course:courses(id, name),
      round_players(
        id, user_id, guest_name, player_position,
        user:users(id, display_name, avatar_url, is_system, is_financial_only)
      )
    `
    )
    .eq("status", "in_progress")
    .in("format", ["individual", "scramble"])
    .order("created_at", { ascending: false })
    .order("player_position", { referencedTable: "round_players", ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  type U = {
    id: string;
    display_name: string;
    avatar_url: string | null;
    is_system: boolean;
    is_financial_only: boolean;
  };
  type P = {
    id: string;
    user_id: string | null;
    guest_name: string | null;
    user: U | U[] | null;
  };
  type R = {
    id: string;
    round_type: string;
    format: string;
    created_at: string;
    created_by: string | null;
    course: { id: string; name: string } | { id: string; name: string }[] | null;
    round_players: P[];
  };

  const list = (rounds || []) as R[];
  const roundIds = list.map((r) => r.id);

  // Resolve creator display names in one batched query.
  const creatorIds = [
    ...new Set(list.map((r) => r.created_by).filter((id): id is string => !!id)),
  ];
  const creatorById = new Map<string, string>();
  if (creatorIds.length > 0) {
    const { data: creators } = await admin
      .from("users")
      .select("id, display_name")
      .in("id", creatorIds);
    for (const c of creators || []) creatorById.set(c.id, c.display_name);
  }

  // "Thru N" = highest hole number scored anywhere in each round.
  const thruByRound = new Map<string, number>();
  if (roundIds.length > 0) {
    const { data: scores } = await admin
      .from("round_scores")
      .select("round_id, hole_number")
      .in("round_id", roundIds);
    for (const s of scores || []) {
      const cur = thruByRound.get(s.round_id) || 0;
      if (s.hole_number > cur) thruByRound.set(s.round_id, s.hole_number);
    }
  }

  const cards = list.map((r) => {
    const course = r.course
      ? Array.isArray(r.course)
        ? r.course[0]
        : r.course
      : null;

    const players = (r.round_players || [])
      .map((p) => {
        const u = p.user ? (Array.isArray(p.user) ? p.user[0] : p.user) : null;
        if (u) {
          if (u.is_system || u.is_financial_only) return null;
          return {
            id: u.id,
            display_name: u.display_name,
            avatar_url: u.avatar_url,
            is_guest: false,
          };
        }
        // Guest row.
        return {
          id: p.id,
          display_name: p.guest_name || "Guest",
          avatar_url: null,
          is_guest: true,
        };
      })
      .filter(Boolean);

    return {
      round_id: r.id,
      round_type: r.round_type,
      format: r.format,
      created_at: r.created_at,
      created_by: r.created_by,
      creator_name: r.created_by ? creatorById.get(r.created_by) || null : null,
      course_id: course?.id || null,
      course_name: course?.name || "Unknown",
      thru: thruByRound.get(r.id) || 0,
      players,
    };
  });

  return NextResponse.json({ rounds: cards });
}
