import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";
import { FBS_TEAMS, getTeamLogoUrl } from "@/lib/data/fbs-teams";

type Params = Promise<{ id: string; eventId: string; contestId: string }>;

const GAME_SELECT = "id, contest_id, away_team, home_team, away_logo_url, home_logo_url, away_color, home_color, spread, favorite, game_time, tv_channel, is_tiebreaker, winning_team, away_score, home_score, sort_order";

/** Admin Pick'em game slate (#209). Build the games, flag a tiebreaker, enter results. */
async function gate(request: Request, orgId: string, contestId: string) {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) };
  const { data: contest } = await admin.from("v2_contests").select("id, contest_type").eq("id", contestId).eq("org_id", orgId).maybeSingle();
  if (!contest || contest.contest_type !== "pickem") return { error: NextResponse.json({ error: "Not a Pick'em contest" }, { status: 404 }) };
  return { admin, userId };
}

// Resolve the two team sides to stored name + logo + color from the FBS catalog.
function teamFields(side: "away" | "home", name: string) {
  const t = FBS_TEAMS.find((x) => x.shortName === name || x.name === name);
  return {
    [`${side}_team`]: t?.shortName || name,
    [`${side}_logo_url`]: t ? getTeamLogoUrl(t) : null,
    [`${side}_color`]: t?.primaryColor || null,
  } as Record<string, unknown>;
}

export async function GET(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  const { data } = await g.admin.from("v2_pickem_games").select(GAME_SELECT).eq("contest_id", contestId).order("sort_order").order("game_time");
  return NextResponse.json({ games: data || [] });
}

export async function POST(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: { away_team?: string; home_team?: string; spread?: number; favorite?: string; game_time?: string | null; tv_channel?: string | null; is_tiebreaker?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  if (!body.away_team || !body.home_team) return NextResponse.json({ error: "Both teams are required" }, { status: 400 });

  // Only one tiebreaker per contest.
  if (body.is_tiebreaker) await g.admin.from("v2_pickem_games").update({ is_tiebreaker: false }).eq("contest_id", contestId);

  const { data: last } = await g.admin.from("v2_pickem_games").select("sort_order").eq("contest_id", contestId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await g.admin.from("v2_pickem_games").insert({
    contest_id: contestId,
    ...teamFields("away", body.away_team),
    ...teamFields("home", body.home_team),
    spread: typeof body.spread === "number" ? Math.abs(body.spread) : null,
    favorite: body.favorite === "away" || body.favorite === "home" ? body.favorite : null,
    game_time: body.game_time || null,
    tv_channel: (body.tv_channel || "").trim() || null,
    is_tiebreaker: !!body.is_tiebreaker,
    sort_order: (last?.sort_order ?? -1) + 1,
  }).select(GAME_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ game: data });
}

export async function PATCH(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const gameId = body.gameId as string | undefined;
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.away_team === "string") Object.assign(patch, teamFields("away", body.away_team));
  if (typeof body.home_team === "string") Object.assign(patch, teamFields("home", body.home_team));
  if ("spread" in body) patch.spread = typeof body.spread === "number" ? Math.abs(body.spread) : null;
  if ("favorite" in body) patch.favorite = body.favorite === "away" || body.favorite === "home" ? body.favorite : null;
  if ("game_time" in body) patch.game_time = (body.game_time as string) || null;
  if ("tv_channel" in body) patch.tv_channel = String(body.tv_channel || "").trim() || null;
  if ("away_score" in body) patch.away_score = typeof body.away_score === "number" ? body.away_score : null;
  if ("home_score" in body) patch.home_score = typeof body.home_score === "number" ? body.home_score : null;
  if ("winning_team" in body) patch.winning_team = body.winning_team === "away" || body.winning_team === "home" ? body.winning_team : null;
  if ("is_tiebreaker" in body && body.is_tiebreaker) {
    await g.admin.from("v2_pickem_games").update({ is_tiebreaker: false }).eq("contest_id", contestId);
    patch.is_tiebreaker = true;
  } else if ("is_tiebreaker" in body) {
    patch.is_tiebreaker = false;
  }

  const { data, error } = await g.admin.from("v2_pickem_games").update(patch).eq("id", gameId).eq("contest_id", contestId).select(GAME_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ game: data });
}

export async function DELETE(request: Request, { params }: { params: Params }) {
  const { id: orgId, contestId } = await params;
  const g = await gate(request, orgId, contestId);
  if ("error" in g) return g.error;
  const gameId = new URL(request.url).searchParams.get("gameId");
  if (!gameId) return NextResponse.json({ error: "gameId required" }, { status: 400 });
  const { error } = await g.admin.from("v2_pickem_games").delete().eq("id", gameId).eq("contest_id", contestId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
