import { NextResponse } from "next/server";
import { v2GetUser } from "@/lib/v2/supabase";
import { fetchScoreboard, getLeague, LEAGUES } from "@/lib/v2/sports/espn";

/**
 * GET /api/v2/sports/games?league=<key>&date=<YYYYMMDD>
 *
 * Server-side ESPN proxy for the game picker (#230) — the client never calls
 * ESPN directly (avoids CORS + keeps the normalize in one place). Returns the
 * normalized games for a league on a date; omit `date` for ESPN's current slate.
 * Also returns the league catalog so the picker can build its selector.
 */
export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const league = searchParams.get("league");
  if (!league) {
    // No league → hand back the catalog so the picker can populate its dropdown.
    return NextResponse.json({ leagues: LEAGUES.map((l) => ({ key: l.key, label: l.label })) });
  }
  if (!getLeague(league)) return NextResponse.json({ error: "Unknown league" }, { status: 400 });

  const date = searchParams.get("date") || undefined; // YYYYMMDD
  if (date && !/^\d{8}$/.test(date)) return NextResponse.json({ error: "date must be YYYYMMDD" }, { status: 400 });

  try {
    const games = await fetchScoreboard(league, date);
    return NextResponse.json({ games });
  } catch {
    return NextResponse.json({ error: "Could not reach ESPN. Try again." }, { status: 502 });
  }
}
