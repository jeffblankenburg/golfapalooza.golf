import type { SupabaseClient } from "@supabase/supabase-js";
import { FBS_TEAMS, getTeamLogoUrl } from "@/lib/data/fbs-teams";
import { isSlateLocked, rankPickem, type PickemGame, type PickemPick } from "@/lib/v2/contests/pickem";
import { fetchGameScore } from "@/lib/v2/sports/espn";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * Server-side Pick'em engine (#209). The single source of truth for the Pick'em
 * slate + picks, independent of contest SCOPE: it operates on a `contestId` and
 * never assumes whether the contest is event-scoped (`event_id` set) or group-
 * scoped (`event_id` NULL). Route handlers in both URL namespaces are thin
 * shells that do auth + scope (eligibility/money) and then delegate here, so the
 * engine stays identical in either case.
 */

export const GAME_SELECT =
  "id, contest_id, away_team, home_team, away_abbrev, home_abbrev, away_logo_url, home_logo_url, away_color, home_color, spread, favorite, game_time, tv_channel, is_tiebreaker, winning_team, away_score, home_score, sort_order, espn_event_id, league";

/** Uniform result so shells can translate to the exact HTTP status without the
 *  engine importing NextResponse. */
export type PickemResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export interface AddGameInput {
  away_team?: string;
  home_team?: string;
  spread?: number;
  favorite?: string;
  game_time?: string | null;
  tv_channel?: string | null;
  is_tiebreaker?: boolean;
}

export interface SubmitPickInput {
  gameId?: string;
  pickedTeam?: "away" | "home" | null;
  tiebreakerTotal?: number | null;
}

// Resolve the two team sides to stored name + logo + color from the FBS catalog.
function teamFields(side: "away" | "home", name: string): Record<string, unknown> {
  const t = FBS_TEAMS.find((x) => x.shortName === name || x.name === name);
  return {
    [`${side}_team`]: t?.shortName || name,
    [`${side}_logo_url`]: t ? getTeamLogoUrl(t) : null,
    [`${side}_color`]: t?.primaryColor || null,
  };
}

/** True once anyone has picked a side on this game — its line is then frozen so
 *  it can't move out from under existing picks. */
async function isLineLocked(admin: SupabaseClient, gameId: string): Promise<boolean> {
  const { data } = await admin
    .from("v2_pickem_picks").select("id").eq("game_id", gameId).not("picked_team", "is", null).limit(1);
  return (data?.length ?? 0) > 0;
}

/** True once anyone has picked ANY game in the contest — the tiebreaker choice is
 *  then frozen (changing it would shift whole-contest standings). */
async function contestHasPicks(admin: SupabaseClient, contestId: string): Promise<boolean> {
  const { data: games } = await admin.from("v2_pickem_games").select("id").eq("contest_id", contestId);
  const ids = (games || []).map((g) => g.id as string);
  if (ids.length === 0) return false;
  const { data } = await admin
    .from("v2_pickem_picks").select("id").in("game_id", ids).not("picked_team", "is", null).limit(1);
  return (data?.length ?? 0) > 0;
}

/** List a contest's game slate, ordered for display, each flagged `locked` if a
 *  pick has been made on it (line can no longer change). */
export async function listGames(admin: SupabaseClient, contestId: string) {
  const { data } = await admin
    .from("v2_pickem_games")
    .select(GAME_SELECT)
    .eq("contest_id", contestId)
    .order("sort_order")
    .order("game_time");
  const games = data || [];
  if (games.length === 0) return games;
  const { data: picks } = await admin
    .from("v2_pickem_picks").select("game_id").in("game_id", games.map((g) => g.id as string)).not("picked_team", "is", null);
  const locked = new Set((picks || []).map((p) => p.game_id as string));
  return games.map((g) => ({ ...g, locked: locked.has(g.id as string) }));
}

/** Add one game to the slate (admin). Enforces a single tiebreaker per contest. */
export async function addGame(admin: SupabaseClient, contestId: string, body: AddGameInput): Promise<PickemResult<unknown>> {
  if (!body.away_team || !body.home_team) return { ok: false, status: 400, error: "Both teams are required" };

  if (body.is_tiebreaker) await admin.from("v2_pickem_games").update({ is_tiebreaker: false }).eq("contest_id", contestId);

  const { data: last } = await admin
    .from("v2_pickem_games")
    .select("sort_order")
    .eq("contest_id", contestId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data, error } = await admin
    .from("v2_pickem_games")
    .insert({
      contest_id: contestId,
      ...teamFields("away", body.away_team),
      ...teamFields("home", body.home_team),
      spread: typeof body.spread === "number" ? Math.abs(body.spread) : null,
      favorite: body.favorite === "away" || body.favorite === "home" ? body.favorite : null,
      game_time: body.game_time || null,
      tv_channel: (body.tv_channel || "").trim() || null,
      is_tiebreaker: !!body.is_tiebreaker,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select(GAME_SELECT)
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data };
}

export interface EspnGameInput {
  espnEventId: string;
  league: string;
  startTime?: string | null;
  tv?: string | null;
  spread?: number | null;
  favorite?: "home" | "away" | null;
  away: { name?: string; abbrev?: string; logo?: string | null; color?: string | null } | null;
  home: { name?: string; abbrev?: string; logo?: string | null; color?: string | null } | null;
}

/**
 * Add games to the slate straight from the ESPN picker (parity with Squares). Teams,
 * kickoff, TV, and the line (spread + favorite) come from the feed; the admin can
 * tweak the line afterward. Dedups by `espn_event_id` so re-opening the picker and
 * re-confirming never duplicates a game.
 */
export async function addEspnGames(admin: SupabaseClient, contestId: string, games: EspnGameInput[]): Promise<PickemResult<number>> {
  if (!games.length) return { ok: true, data: 0 };
  const { data: existing } = await admin.from("v2_pickem_games").select("espn_event_id, sort_order").eq("contest_id", contestId);
  const have = new Set((existing || []).map((r) => r.espn_event_id as string | null).filter(Boolean));
  let sort = Math.max(-1, ...(existing || []).map((r) => (r.sort_order as number) ?? -1));
  const rows = games
    .filter((g) => g.espnEventId && !have.has(g.espnEventId))
    .map((g) => ({
      contest_id: contestId,
      espn_event_id: g.espnEventId,
      league: g.league,
      away_team: g.away?.name || g.away?.abbrev || "Away",
      home_team: g.home?.name || g.home?.abbrev || "Home",
      away_abbrev: g.away?.abbrev || null,
      home_abbrev: g.home?.abbrev || null,
      away_logo_url: g.away?.logo ?? null,
      home_logo_url: g.home?.logo ?? null,
      away_color: g.away?.color ?? null,
      home_color: g.home?.color ?? null,
      spread: typeof g.spread === "number" ? Math.abs(g.spread) : null,
      favorite: g.favorite === "away" || g.favorite === "home" ? g.favorite : null,
      game_time: g.startTime || null,
      tv_channel: g.tv || null,
      sort_order: ++sort,
    }));
  if (!rows.length) return { ok: true, data: 0 };

  // Past games come from the scoreboard WITHOUT a line (ESPN drops it once final).
  // For those, backfill the line (and final score, if over) from the summary's
  // pickcenter, which persists. Upcoming games already carry their line, so skip.
  const enriched = await Promise.all(rows.map(async (r) => {
    if (r.spread != null) return r;
    try {
      const s = await fetchGameScore(r.league as string, r.espn_event_id as string);
      if (!s) return r;
      const extra: Record<string, unknown> = {
        spread: typeof s.spread === "number" ? s.spread : null,
        favorite: s.favorite ?? null,
      };
      if (s.state === "post" && s.away?.total != null && s.home?.total != null) {
        extra.away_score = s.away.total;
        extra.home_score = s.home.total;
        extra.winning_team = s.away.total === s.home.total ? null : s.away.total > s.home.total ? "away" : "home";
      }
      return { ...r, ...extra };
    } catch {
      return r;
    }
  }));
  const { error } = await admin.from("v2_pickem_games").insert(enriched);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: rows.length };
}

/** Patch one game: teams, line, kickoff, result, or tiebreaker flag (admin). */
export async function patchGame(admin: SupabaseClient, contestId: string, body: Record<string, unknown>): Promise<PickemResult<unknown>> {
  const gameId = body.gameId as string | undefined;
  if (!gameId) return { ok: false, status: 400, error: "gameId required" };

  // The line/teams freeze once anyone has picked this game — refuse line changes.
  const touchesLine = "spread" in body || "favorite" in body || "away_team" in body || "home_team" in body;
  if (touchesLine && (await isLineLocked(admin, gameId))) {
    return { ok: false, status: 409, error: "Picks have already been made on this game — its line is locked." };
  }
  // The tiebreaker choice freezes once anyone has picked ANY game in the contest.
  if ("is_tiebreaker" in body && (await contestHasPicks(admin, contestId))) {
    return { ok: false, status: 409, error: "Picks have been made — the tiebreaker is locked." };
  }

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
    await admin.from("v2_pickem_games").update({ is_tiebreaker: false }).eq("contest_id", contestId);
    patch.is_tiebreaker = true;
  } else if ("is_tiebreaker" in body) {
    patch.is_tiebreaker = false;
  }

  const { data, error } = await admin
    .from("v2_pickem_games")
    .update(patch)
    .eq("id", gameId)
    .eq("contest_id", contestId)
    .select(GAME_SELECT)
    .single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data };
}

/**
 * Re-pull one game from ESPN: always refresh the line (spread + favorite), and if
 * the game is FINAL, also pull the final score (total, overtime included). Only
 * works on ESPN-linked games. The score half is a no-op until the game is final,
 * so pressing Update early just freshens the line.
 */
export async function refreshGameLine(admin: SupabaseClient, contestId: string, gameId: string): Promise<PickemResult<unknown>> {
  const { data: g } = await admin
    .from("v2_pickem_games").select("id, espn_event_id, league").eq("id", gameId).eq("contest_id", contestId).maybeSingle();
  if (!g) return { ok: false, status: 404, error: "Game not found" };
  if (!g.espn_event_id || !g.league) return { ok: false, status: 400, error: "This game isn't linked to ESPN — edit it manually." };

  // The summary endpoint (by id, no date) carries BOTH the line (pickcenter — it
  // survives after the game is final, unlike the scoreboard) and the final score.
  let score;
  try {
    score = await fetchGameScore(g.league as string, g.espn_event_id as string);
  } catch {
    return { ok: false, status: 502, error: "Couldn't reach ESPN. Try again." };
  }
  if (!score) return { ok: false, status: 404, error: "ESPN has no data for this game yet." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  // Only touch the line when ESPN offers one AND no picks have locked it. Never
  // erase a saved line (ESPN can drop it after a game, and we keep ours).
  if (typeof score.spread === "number" && !(await isLineLocked(admin, gameId))) {
    patch.spread = score.spread; // already a magnitude
    patch.favorite = score.favorite ?? null;
  }
  // Scores only once final — the total includes overtime.
  if (score.state === "post" && score.away?.total != null && score.home?.total != null) {
    const a = score.away.total, h = score.home.total;
    patch.away_score = a;
    patch.home_score = h;
    patch.winning_team = a === h ? null : a > h ? "away" : "home";
  }

  const { data, error } = await admin
    .from("v2_pickem_games").update(patch).eq("id", gameId).eq("contest_id", contestId).select(GAME_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data };
}

/**
 * Auto-grade FINAL games from ESPN (cron + the manual "Update scores" button).
 * Only writes a game once ESPN marks it final, and uses the FINAL TOTAL (which
 * includes overtime) — never a quarter/half checkpoint. Never clobbers a game
 * that's already scored (manual entry or a prior run wins). Pass a contestId to
 * grade one contest on demand; omit it to sweep every active Pick'em.
 */
export async function gradePickemFinals(admin: SupabaseClient, opts: { contestId?: string } = {}): Promise<{ graded: number }> {
  let cq = admin.from("v2_contests").select("id").eq("contest_type", "pickem");
  cq = opts.contestId ? cq.eq("id", opts.contestId) : cq.eq("status", "active");
  const { data: contests } = await cq;
  const ids = (contests ?? []).map((c) => c.id as string);
  if (ids.length === 0) return { graded: 0 };

  // Ungraded, ESPN-linked games whose kickoff has arrived (15m cushion).
  const cushion = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: games } = await admin
    .from("v2_pickem_games")
    .select("id, league, espn_event_id, away_score, home_score, game_time")
    .in("contest_id", ids)
    .not("espn_event_id", "is", null)
    .or("away_score.is.null,home_score.is.null");
  const due = (games ?? []).filter((g) => !g.game_time || (g.game_time as string) <= cushion);
  if (due.length === 0) return { graded: 0 };

  let graded = 0;
  for (const g of due) {
    const score = await fetchGameScore(g.league as string, g.espn_event_id as string);
    if (!score || score.state !== "post") continue; // finals only
    const a = score.away?.total;
    const h = score.home?.total;
    if (a == null || h == null) continue;
    const winning_team = a === h ? null : a > h ? "away" : "home";
    const { error } = await admin
      .from("v2_pickem_games")
      .update({ away_score: a, home_score: h, winning_team, updated_at: new Date().toISOString() })
      .eq("id", g.id);
    if (!error) graded += 1;
  }
  return { graded };
}

/** Delete one game from the slate (admin). */
export async function deleteGame(admin: SupabaseClient, contestId: string, gameId: string | null): Promise<PickemResult<null>> {
  if (!gameId) return { ok: false, status: 400, error: "gameId required" };
  const { error } = await admin.from("v2_pickem_games").delete().eq("id", gameId).eq("contest_id", contestId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Reset: clear everyone's picks. Game slate + results stay. */
export async function resetPicks(admin: SupabaseClient, contestId: string): Promise<PickemResult<null>> {
  const { data: games } = await admin.from("v2_pickem_games").select("id").eq("contest_id", contestId);
  const gameIds = (games || []).map((g) => g.id as string);
  if (gameIds.length) {
    const { error } = await admin.from("v2_pickem_picks").delete().in("game_id", gameIds);
    if (error) return { ok: false, status: 500, error: error.message };
  }
  return { ok: true, data: null };
}

/**
 * Save one member pick. Scope-agnostic: the caller has already verified the
 * member is eligible for this contest; here we enforce only the contest-open
 * and slate-lock rules, then upsert. Picks lock at the earliest kickoff.
 */
export async function submitPick(
  admin: SupabaseClient,
  contestId: string,
  userId: string,
  body: SubmitPickInput,
  now: Date,
  contestStatus: string,
): Promise<PickemResult<null>> {
  if (!body.gameId) return { ok: false, status: 400, error: "gameId required" };

  const { data: game } = await admin.from("v2_pickem_games").select("id, contest_id").eq("id", body.gameId).maybeSingle();
  if (!game || game.contest_id !== contestId) return { ok: false, status: 404, error: "Game not found" };

  if (contestStatus !== "active") return { ok: false, status: 403, error: "Pick'em isn't open" };

  const { data: games } = await admin.from("v2_pickem_games").select("game_time").eq("contest_id", contestId);
  if (isSlateLocked((games || []) as PickemGame[], now)) return { ok: false, status: 403, error: "Picks are locked" };

  const picked = body.pickedTeam === "away" || body.pickedTeam === "home" ? body.pickedTeam : null;
  const tb = typeof body.tiebreakerTotal === "number" && body.tiebreakerTotal >= 0 ? Math.round(body.tiebreakerTotal) : null;
  const { error } = await admin.from("v2_pickem_picks").upsert(
    { game_id: body.gameId, user_id: userId, picked_team: picked, tiebreaker_total: tb, updated_at: new Date().toISOString() },
    { onConflict: "game_id,user_id" },
  );
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/**
 * Create a Pick'em contest. Scope is the single `eventId` arg: a string makes it
 * event-scoped, `null` makes it group-scoped (all members, opt-in). Everything
 * else about the contest is identical. Starts in `draft`; the admin builds the
 * slate, then opens it.
 */
export async function createPickem(
  admin: SupabaseClient,
  input: { orgId: string; eventId: string | null; name: string; createdBy: string },
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("v2_contests")
    .insert({
      org_id: input.orgId,
      event_id: input.eventId,
      contest_type: "pickem",
      name: input.name,
      scoring_source: "derived", // graded from entered game results
      status: "draft",
      auto_enroll: false, // opt-in: members make picks
      created_by: input.createdBy,
    })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the contest");
  return { id: data.id as string };
}

/** One leaderboard row — matches `PickemContent`'s `LeaderEntry` shape. */
export interface PickemLeaderEntry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  correct: number;
  decided: number;
  pickedCount: number;
  tiebreakerTotal: number | null;
  tiebreakerDiff: number | null;
  rank: number;
  picks: { gameId: string; pickedTeam: "away" | "home" | null }[] | null;
}

export interface PickemBoard {
  games: PickemGame[];
  leaderboard: PickemLeaderEntry[];
  myPicks: Record<string, { picked: "away" | "home" | null; tiebreaker: number | null }>;
  locked: boolean;
  totalGames: number;
}

/**
 * Load everything the member Pick'em UI needs for one contest — scope-agnostic,
 * so the event page and the group contest-detail page share it (no duplicated
 * assembly). Individual picks are only revealed once the slate locks.
 */
export async function loadPickemBoard(
  supabase: SupabaseClient,
  input: { contestId: string; orgId: string; viewerId: string; now: Date },
): Promise<PickemBoard> {
  const { data: gameRows } = await supabase
    .from("v2_pickem_games")
    .select(GAME_SELECT)
    .eq("contest_id", input.contestId)
    .order("sort_order")
    .order("game_time");
  const games = (gameRows || []) as PickemGame[];
  const gameIds = games.map((g) => g.id);

  const { data: pickRows } = gameIds.length
    ? await supabase.from("v2_pickem_picks").select("game_id, user_id, picked_team, tiebreaker_total").in("game_id", gameIds)
    : { data: [] as PickemPick[] };
  const picks = (pickRows || []) as PickemPick[];

  const locked = isSlateLocked(games, input.now);
  const ranked = rankPickem(games, picks);

  const userIds = [...new Set(picks.map((p) => p.user_id))];
  const [{ data: profs }, mode] = await Promise.all([
    userIds.length
      ? supabase.from("v2_profiles").select("id, display_name, first_name, last_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null }[] }),
    orgNameMode(supabase, input.orgId),
  ]);
  const prof = new Map((profs || []).map((p) => [p.id as string, p]));

  // Only reveal individual picks once the slate is locked (no early peeking).
  const picksByUser = new Map<string, PickemPick[]>();
  if (locked) for (const p of picks) (picksByUser.get(p.user_id) || picksByUser.set(p.user_id, []).get(p.user_id)!).push(p);

  const leaderboard: PickemLeaderEntry[] = ranked.map((r) => ({
    userId: r.userId,
    name: prof.has(r.userId) ? pickName(prof.get(r.userId)!, mode) : "Member",
    avatarUrl: (prof.get(r.userId)?.avatar_url as string | null) ?? null,
    correct: r.correct,
    decided: r.decided,
    pickedCount: r.pickedCount,
    tiebreakerTotal: r.tiebreakerTotal,
    tiebreakerDiff: r.tiebreakerDiff,
    rank: r.rank,
    picks: locked ? (picksByUser.get(r.userId) || []).map((p) => ({ gameId: p.game_id, pickedTeam: p.picked_team })) : null,
  }));

  const myPicks: Record<string, { picked: "away" | "home" | null; tiebreaker: number | null }> = {};
  for (const p of picks) if (p.user_id === input.viewerId) myPicks[p.game_id] = { picked: p.picked_team, tiebreaker: p.tiebreaker_total };

  return { games, leaderboard, myPicks, locked, totalGames: games.length };
}
