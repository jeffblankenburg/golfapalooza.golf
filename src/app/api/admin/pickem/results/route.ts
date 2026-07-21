import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { computePickemRankings } from "@/lib/pickem/rankings";
import { materializePickemWinners } from "@/lib/winners/materialize";

// GET - Calculate and return standings
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_pickem");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    // Standings come from the shared helper (also used by the issue #124
    // winners materializer so both surfaces score Pickem identically).
    // The view layer needs avatar/full_name on each row, so we layer those
    // back in here rather than bloating the helper.
    const [ranked, profilesRes, gamesRes] = await Promise.all([
      computePickemRankings(adminClient, contestId),
      adminClient
        .from("contest_participants")
        .select(
          "user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)",
        )
        .eq("contest_id", contestId),
      adminClient
        .from("pickem_games")
        .select("winning_team, is_tiebreaker, away_score, home_score")
        .eq("contest_id", contestId),
    ]);

    const profileByUser = new Map<string, { id: string; full_name: string | null; avatar_url: string | null }>();
    for (const p of profilesRes.data || []) {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      const user = u as { id: string; full_name: string | null; avatar_url: string | null } | null;
      if (user) {
        profileByUser.set(p.user_id, {
          id: user.id,
          full_name: user.full_name,
          avatar_url: user.avatar_url,
        });
      }
    }
    const standings = ranked.map((r) => ({
      ...r,
      ...profileByUser.get(r.user_id),
    }));

    const games = gamesRes.data || [];
    const tiebreakerGame = games.find((g) => g.is_tiebreaker);
    const tiebreakerActualTotal =
      tiebreakerGame && tiebreakerGame.away_score !== null && tiebreakerGame.home_score !== null
        ? tiebreakerGame.away_score + tiebreakerGame.home_score
        : null;

    return NextResponse.json({
      standings,
      tiebreaker_actual_total: tiebreakerActualTotal,
      games_decided: games.filter((g) => g.winning_team).length,
      games_total: games.length,
    });
  } catch (error) {
    console.error("Get pickem standings error:", error);
    return NextResponse.json({ error: "Failed to calculate standings" }, { status: 500 });
  }
}

// PUT - Mark game result
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_pickem");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, winning_team, away_score, home_score } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data: updated, error } = await adminClient
      .from("pickem_games")
      .update({
        winning_team: winning_team || null,
        away_score: away_score !== undefined ? away_score : null,
        home_score: home_score !== undefined ? home_score : null,
      })
      .eq("id", id)
      .select("contest_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Issue #124: rerun the unified-winners materialization. Game
    // results can shift rankings; the materializer reconciles winners
    // (paid status preserved on rows that survive).
    if (updated?.contest_id) {
      await materializePickemWinners(adminClient, updated.contest_id).catch((err) => {
        console.error("materializePickemWinners failed:", err);
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark pickem result error:", error);
    return NextResponse.json({ error: "Failed to mark result" }, { status: 500 });
  }
}
