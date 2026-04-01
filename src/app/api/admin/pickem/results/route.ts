import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

function isPickCorrect(
  pick: { picked_team: string },
  game: { favorite: string; spread: number; away_score: number | null; home_score: number | null; winning_team: string | null }
): boolean | null {
  if (!game.winning_team || game.away_score === null || game.home_score === null) {
    return null; // game not decided
  }

  // margin from home team's perspective (positive = home won by that much)
  const margin = game.home_score - game.away_score;

  // spread is stored as the favorite's line (e.g., -7.5)
  // Convert to home team's spread: if home is favorite, homeSpread = spread (negative)
  // If away is favorite, homeSpread = -spread (positive, meaning home is underdog getting points)
  const homeSpread = game.favorite === "home" ? game.spread : -game.spread;

  // Home covers if margin + homeSpread > 0
  // (e.g., home is -7.5 favorite, wins by 10: 10 + (-7.5) = 2.5 > 0 → covers)
  // (e.g., home is +3.5 underdog, loses by 2: -2 + 3.5 = 1.5 > 0 → covers)
  const homeCovers = margin + homeSpread > 0;

  if (pick.picked_team === "home") return homeCovers;
  return !homeCovers; // away covers = home doesn't cover
}

// GET - Calculate and return standings
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
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

    const [gamesRes, participantsRes] = await Promise.all([
      adminClient
        .from("pickem_games")
        .select("*, pickem_picks(*)")
        .eq("contest_id", contestId)
        .order("sort_order"),
      adminClient
        .from("contest_participants")
        .select("user_id, user:users!contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)")
        .eq("contest_id", contestId),
    ]);

    const games = gamesRes.data || [];
    const participants = (participantsRes.data || []).map((p) => {
      const user = Array.isArray(p.user) ? p.user[0] : p.user;
      return {
        user_id: p.user_id,
        display_name: user?.display_name || "Unknown",
        full_name: user?.full_name || null,
        avatar_url: user?.avatar_url || null,
      };
    });

    // Find tiebreaker game
    const tiebreakerGame = games.find((g) => g.is_tiebreaker);
    const tiebreakerActualTotal =
      tiebreakerGame && tiebreakerGame.away_score !== null && tiebreakerGame.home_score !== null
        ? tiebreakerGame.away_score + tiebreakerGame.home_score
        : null;

    // Calculate standings per participant
    const standings = participants.map((p) => {
      let correct = 0;
      let total = 0;
      let decided = 0;
      let tiebreakerTotal: number | null = null;

      for (const game of games) {
        const picks = (game.pickem_picks || []) as Array<{
          user_id: string;
          picked_team: string;
          tiebreaker_total: number | null;
        }>;
        const pick = picks.find((pk) => pk.user_id === p.user_id);

        if (pick) {
          total++;
          const result = isPickCorrect(pick, game);
          if (result !== null) {
            decided++;
            if (result) correct++;
          }
          if (game.is_tiebreaker && pick.tiebreaker_total !== null) {
            tiebreakerTotal = pick.tiebreaker_total;
          }
        }
      }

      const tiebreakerDiff =
        tiebreakerTotal !== null && tiebreakerActualTotal !== null
          ? Math.abs(tiebreakerTotal - tiebreakerActualTotal)
          : null;

      return {
        ...p,
        correct,
        total,
        decided,
        tiebreaker_total: tiebreakerTotal,
        tiebreaker_diff: tiebreakerDiff,
      };
    });

    // Sort by correct (desc), then tiebreaker_diff (asc, closest wins)
    standings.sort((a, b) => {
      if (b.correct !== a.correct) return b.correct - a.correct;
      if (a.tiebreaker_diff !== null && b.tiebreaker_diff !== null) {
        return a.tiebreaker_diff - b.tiebreaker_diff;
      }
      if (a.tiebreaker_diff !== null) return -1;
      if (b.tiebreaker_diff !== null) return 1;
      return 0;
    });

    // Assign ranks (handle ties)
    let rank = 1;
    for (let i = 0; i < standings.length; i++) {
      if (i > 0) {
        const prev = standings[i - 1];
        const curr = standings[i];
        if (curr.correct !== prev.correct || curr.tiebreaker_diff !== prev.tiebreaker_diff) {
          rank = i + 1;
        }
      }
      (standings[i] as Record<string, unknown>).rank = rank;
    }

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
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, winning_team, away_score, home_score } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("pickem_games")
      .update({
        winning_team: winning_team || null,
        away_score: away_score !== undefined ? away_score : null,
        home_score: home_score !== undefined ? home_score : null,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark pickem result error:", error);
    return NextResponse.json({ error: "Failed to mark result" }, { status: 500 });
  }
}
