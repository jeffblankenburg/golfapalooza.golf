import type { SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "crypto";
import { FBS_TEAMS, getTeamLogoUrl } from "@/lib/data/fbs-teams";
import { rankPickem, slateLockAt, gameLocked, lockModeOf, type LockMode, type PickemGame, type PickemPick } from "@/lib/v2/contests/pickem";
import { fetchGameScore } from "@/lib/v2/sports/espn";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * Server-side Pick'em engine (#209). The single source of truth for the Pick'em
 * slate + picks, independent of contest SCOPE: it operates on a `contestId` and
 * never assumes whether the contest is event-scoped (`event_id` set) or group-
 * scoped (`event_id` NULL). Route handlers in both URL namespaces are thin shells.
 *
 * Storage: the generic slate substrate (#224) — v2_matchups / v2_picks. This engine
 * is the Pick'em ADAPTER over it: it maps the generic rows to/from the flat PickemGame
 * / PickemPick shape the UI already consumes, so nothing above this file changed. The
 * away side is competitor_a, home is competitor_b; favorite/winner map away↔'a',
 * home↔'b'; tv + espn ids ride in external_ref; scores live in result.
 */

export const MATCHUP_SELECT =
  "id, contest_id, slot, round, sort_order, competitor_a, competitor_b, start_time, spread, favorite, over_under, external_ref, status, result, is_tiebreaker";

type Side = "a" | "b";
type Team = "away" | "home";
const favToTeam = (s: unknown): Team | null => (s === "a" ? "away" : s === "b" ? "home" : null);
const teamToFav = (t: unknown): Side | null => (t === "away" ? "a" : t === "home" ? "b" : null);

interface Competitor { name?: string; abbrev?: string | null; logo?: string | null; color?: string | null }
export interface MatchupRow {
  id: string; contest_id: string; sort_order: number;
  competitor_a: Competitor | null; competitor_b: Competitor | null;
  start_time: string | null; spread: number | null; favorite: Side | null;
  external_ref: { espn_event_id?: string | null; league?: string | null; tv?: string | null } | null;
  status: string; result: { winner: Side | null; score_a: number | null; score_b: number | null } | null;
  is_tiebreaker: boolean;
}

/** Map a v2_matchups row to the flat Pick'em game shape the UI + rankers expect.
 *  Exported so preview/payout readers map identically (single source). */
export function matchupToPickemGame(r: MatchupRow): PickemGame & { contest_id: string; espn_event_id: string | null; league: string | null; tv_channel: string | null } {
  const a = r.competitor_a || {}, b = r.competitor_b || {}, ref = r.external_ref || {}, res = r.result;
  return {
    id: r.id,
    contest_id: r.contest_id,
    away_team: a.name || "Away",
    home_team: b.name || "Home",
    away_abbrev: a.abbrev ?? null,
    home_abbrev: b.abbrev ?? null,
    away_logo_url: a.logo ?? null,
    home_logo_url: b.logo ?? null,
    away_color: a.color ?? null,
    home_color: b.color ?? null,
    spread: r.spread,
    favorite: favToTeam(r.favorite),
    game_time: r.start_time,
    tv_channel: ref.tv ?? null,
    is_tiebreaker: !!r.is_tiebreaker,
    winning_team: res ? favToTeam(res.winner) : null,
    away_score: res?.score_a ?? null,
    home_score: res?.score_b ?? null,
    sort_order: r.sort_order,
    espn_event_id: ref.espn_event_id ?? null,
    league: ref.league ?? null,
  } as PickemGame & { contest_id: string; espn_event_id: string | null; league: string | null; tv_channel: string | null };
}

const stripNull = (o: Record<string, unknown>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ""));

/** Build the competitor JSON for one side from a team name (resolves logo/color from
 *  the FBS catalog, parity with the old teamFields). */
function competitorFromName(name: string): Competitor {
  const t = FBS_TEAMS.find((x) => x.shortName === name || x.name === name);
  return stripNull({ name: t?.shortName || name, logo: t ? getTeamLogoUrl(t) : null, color: t?.primaryColor || null }) as Competitor;
}

/** Collapse flat score fields into the result JSONB (+ status), or null when not scored. */
function resultFrom(awayScore: number | null, homeScore: number | null, winningTeam: Team | null) {
  if (awayScore == null || homeScore == null) return { result: null, status: "scheduled" as const };
  return { result: { winner: teamToFav(winningTeam), score_a: awayScore, score_b: homeScore }, status: "final" as const };
}

export type PickemResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

export interface AddGameInput {
  away_team?: string; home_team?: string; spread?: number; favorite?: string;
  game_time?: string | null; tv_channel?: string | null; is_tiebreaker?: boolean;
}

export interface SubmitPickInput {
  gameId?: string; pickedTeam?: "away" | "home" | null; tiebreakerTotal?: number | null;
}

/** True once anyone has picked a side on this game — its line is then frozen. */
async function isLineLocked(admin: SupabaseClient, gameId: string): Promise<boolean> {
  const { data } = await admin.from("v2_picks").select("pick").eq("matchup_id", gameId);
  return (data || []).some((p) => (p.pick as { side?: string } | null)?.side);
}

/** True once anyone has picked ANY game in the contest — the tiebreaker choice freezes. */
async function contestHasPicks(admin: SupabaseClient, contestId: string): Promise<boolean> {
  const { data } = await admin.from("v2_picks").select("pick").eq("contest_id", contestId);
  return (data || []).some((p) => (p.pick as { side?: string } | null)?.side);
}

/** List a contest's slate, ordered for display, each flagged `locked` if a pick has
 *  been made on it (line can no longer change). */
export async function listGames(admin: SupabaseClient, contestId: string) {
  const { data } = await admin
    .from("v2_matchups").select(MATCHUP_SELECT).eq("contest_id", contestId)
    .order("sort_order").order("start_time");
  const rows = (data || []) as unknown as MatchupRow[];
  if (rows.length === 0) return [];
  const { data: picks } = await admin.from("v2_picks").select("matchup_id, pick").eq("contest_id", contestId);
  const locked = new Set((picks || []).filter((p) => (p.pick as { side?: string } | null)?.side).map((p) => p.matchup_id as string));
  return rows.map((r) => ({ ...matchupToPickemGame(r), locked: locked.has(r.id) }));
}

/** Add one game to the slate (admin). Enforces a single tiebreaker per contest. */
export async function addGame(admin: SupabaseClient, contestId: string, body: AddGameInput): Promise<PickemResult<unknown>> {
  if (!body.away_team || !body.home_team) return { ok: false, status: 400, error: "Both teams are required" };
  if (body.is_tiebreaker) await admin.from("v2_matchups").update({ is_tiebreaker: false }).eq("contest_id", contestId);

  const { data: last } = await admin
    .from("v2_matchups").select("sort_order").eq("contest_id", contestId)
    .order("sort_order", { ascending: false }).limit(1).maybeSingle();

  const tv = (body.tv_channel || "").trim() || null;
  const { data, error } = await admin
    .from("v2_matchups")
    .insert({
      contest_id: contestId,
      slot: randomUUID(),
      competitor_a: competitorFromName(body.away_team),
      competitor_b: competitorFromName(body.home_team),
      spread: typeof body.spread === "number" ? Math.abs(body.spread) : null,
      favorite: body.favorite === "away" ? "a" : body.favorite === "home" ? "b" : null,
      start_time: body.game_time || null,
      external_ref: stripNull({ tv }),
      is_tiebreaker: !!body.is_tiebreaker,
      sort_order: (last?.sort_order ?? -1) + 1,
    })
    .select(MATCHUP_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: matchupToPickemGame(data as unknown as MatchupRow) };
}

export interface EspnGameInput {
  espnEventId: string; league: string; startTime?: string | null; tv?: string | null;
  spread?: number | null; favorite?: "home" | "away" | null;
  away: { name?: string; abbrev?: string; logo?: string | null; color?: string | null } | null;
  home: { name?: string; abbrev?: string; logo?: string | null; color?: string | null } | null;
}

/**
 * Add games straight from the ESPN picker. Teams/kickoff/TV/line come from the feed;
 * dedups by external_ref.espn_event_id. Past games arrive without a line (ESPN drops
 * it once final) — backfill line + final score from the summary's pickcenter.
 */
export async function addEspnGames(admin: SupabaseClient, contestId: string, games: EspnGameInput[]): Promise<PickemResult<number>> {
  if (!games.length) return { ok: true, data: 0 };
  const { data: existing } = await admin.from("v2_matchups").select("external_ref, sort_order").eq("contest_id", contestId);
  const have = new Set((existing || []).map((r) => (r.external_ref as { espn_event_id?: string } | null)?.espn_event_id).filter(Boolean));
  let sort = Math.max(-1, ...(existing || []).map((r) => (r.sort_order as number) ?? -1));

  const base = games
    .filter((g) => g.espnEventId && !have.has(g.espnEventId))
    .map((g) => ({
      contest_id: contestId,
      slot: g.espnEventId,
      espnEventId: g.espnEventId,
      league: g.league,
      competitor_a: stripNull({ name: g.away?.name || g.away?.abbrev || "Away", abbrev: g.away?.abbrev || null, logo: g.away?.logo ?? null, color: g.away?.color ?? null }) as Competitor,
      competitor_b: stripNull({ name: g.home?.name || g.home?.abbrev || "Home", abbrev: g.home?.abbrev || null, logo: g.home?.logo ?? null, color: g.home?.color ?? null }) as Competitor,
      spread: typeof g.spread === "number" ? Math.abs(g.spread) : null,
      favorite: g.favorite === "away" ? "a" : g.favorite === "home" ? "b" : null,
      start_time: g.startTime || null,
      tv: g.tv || null,
      sort_order: ++sort,
    }));
  if (!base.length) return { ok: true, data: 0 };

  const rows = await Promise.all(base.map(async (r) => {
    let spread = r.spread, favorite: Side | null = r.favorite as Side | null;
    let result: MatchupRow["result"] = null, status = "scheduled";
    if (spread == null) {
      try {
        const s = await fetchGameScore(r.league, r.espnEventId);
        if (s) {
          if (typeof s.spread === "number") { spread = s.spread; favorite = s.favorite === "away" ? "a" : s.favorite === "home" ? "b" : null; }
          if (s.state === "post" && s.away?.total != null && s.home?.total != null) {
            result = { winner: s.away.total === s.home.total ? null : s.away.total > s.home.total ? "a" : "b", score_a: s.away.total, score_b: s.home.total };
            status = "final";
          }
        }
      } catch { /* leave as-is */ }
    }
    return {
      contest_id: r.contest_id, slot: r.slot, competitor_a: r.competitor_a, competitor_b: r.competitor_b,
      spread, favorite, start_time: r.start_time,
      external_ref: stripNull({ espn_event_id: r.espnEventId, league: r.league, tv: r.tv }),
      result, status, sort_order: r.sort_order,
    };
  }));
  const { error } = await admin.from("v2_matchups").insert(rows);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: rows.length };
}

/** Patch one game: teams, line, kickoff, result, or tiebreaker flag (admin). */
export async function patchGame(admin: SupabaseClient, contestId: string, body: Record<string, unknown>): Promise<PickemResult<unknown>> {
  const gameId = body.gameId as string | undefined;
  if (!gameId) return { ok: false, status: 400, error: "gameId required" };

  const touchesLine = "spread" in body || "favorite" in body || "away_team" in body || "home_team" in body;
  if (touchesLine && (await isLineLocked(admin, gameId))) {
    return { ok: false, status: 409, error: "Picks have already been made on this game — its line is locked." };
  }
  if ("is_tiebreaker" in body && (await contestHasPicks(admin, contestId))) {
    return { ok: false, status: 409, error: "Picks have been made — the tiebreaker is locked." };
  }

  // Read-modify-write: start from the current row so JSON fields (external_ref, result,
  // competitors) merge instead of clobbering.
  const { data: cur } = await admin.from("v2_matchups").select(MATCHUP_SELECT).eq("id", gameId).eq("contest_id", contestId).maybeSingle();
  if (!cur) return { ok: false, status: 404, error: "Game not found" };
  const row = cur as unknown as MatchupRow;
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof body.away_team === "string") patch.competitor_a = { ...(row.competitor_a || {}), ...competitorFromName(body.away_team) };
  if (typeof body.home_team === "string") patch.competitor_b = { ...(row.competitor_b || {}), ...competitorFromName(body.home_team) };
  if ("spread" in body) patch.spread = typeof body.spread === "number" ? Math.abs(body.spread) : null;
  if ("favorite" in body) patch.favorite = body.favorite === "away" ? "a" : body.favorite === "home" ? "b" : null;
  if ("game_time" in body) patch.start_time = (body.game_time as string) || null;
  if ("tv_channel" in body) patch.external_ref = stripNull({ ...(row.external_ref || {}), tv: String(body.tv_channel || "").trim() || null });

  // Scores collapse into result + status; any of the three present recomputes all.
  if ("away_score" in body || "home_score" in body || "winning_team" in body) {
    const aScore = "away_score" in body ? (typeof body.away_score === "number" ? body.away_score : null) : row.result?.score_a ?? null;
    const hScore = "home_score" in body ? (typeof body.home_score === "number" ? body.home_score : null) : row.result?.score_b ?? null;
    const win = "winning_team" in body
      ? (body.winning_team === "away" || body.winning_team === "home" ? (body.winning_team as Team) : null)
      : favToTeam(row.result?.winner);
    const { result, status } = resultFrom(aScore, hScore, win);
    patch.result = result;
    patch.status = status;
  }

  if ("is_tiebreaker" in body && body.is_tiebreaker) {
    await admin.from("v2_matchups").update({ is_tiebreaker: false }).eq("contest_id", contestId);
    patch.is_tiebreaker = true;
  } else if ("is_tiebreaker" in body) {
    patch.is_tiebreaker = false;
  }

  const { data, error } = await admin
    .from("v2_matchups").update(patch).eq("id", gameId).eq("contest_id", contestId).select(MATCHUP_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: matchupToPickemGame(data as unknown as MatchupRow) };
}

/** Re-pull one game from ESPN: refresh the line (unless locked), and the final score if over. */
export async function refreshGameLine(admin: SupabaseClient, contestId: string, gameId: string): Promise<PickemResult<unknown>> {
  const { data: cur } = await admin.from("v2_matchups").select(MATCHUP_SELECT).eq("id", gameId).eq("contest_id", contestId).maybeSingle();
  if (!cur) return { ok: false, status: 404, error: "Game not found" };
  const row = cur as unknown as MatchupRow;
  const espnId = row.external_ref?.espn_event_id, league = row.external_ref?.league;
  if (!espnId || !league) return { ok: false, status: 400, error: "This game isn't linked to ESPN — edit it manually." };

  let score;
  try { score = await fetchGameScore(league, espnId); }
  catch { return { ok: false, status: 502, error: "Couldn't reach ESPN. Try again." }; }
  if (!score) return { ok: false, status: 404, error: "ESPN has no data for this game yet." };

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof score.spread === "number" && !(await isLineLocked(admin, gameId))) {
    patch.spread = score.spread;
    patch.favorite = score.favorite === "away" ? "a" : score.favorite === "home" ? "b" : null;
  }
  if (score.state === "post" && score.away?.total != null && score.home?.total != null) {
    const a = score.away.total, h = score.home.total;
    patch.result = { winner: a === h ? null : a > h ? "a" : "b", score_a: a, score_b: h };
    patch.status = "final";
  }

  const { data, error } = await admin
    .from("v2_matchups").update(patch).eq("id", gameId).eq("contest_id", contestId).select(MATCHUP_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: matchupToPickemGame(data as unknown as MatchupRow) };
}

/**
 * Auto-grade FINAL games from ESPN (cron + manual "Update scores"). Only writes once
 * ESPN marks a game final, using the final total (overtime included); never clobbers a
 * game already scored. Pass a contestId for one contest; omit to sweep every active one.
 */
export async function gradePickemFinals(admin: SupabaseClient, opts: { contestId?: string } = {}): Promise<{ graded: number }> {
  let cq = admin.from("v2_contests").select("id").eq("contest_type", "pickem");
  cq = opts.contestId ? cq.eq("id", opts.contestId) : cq.eq("status", "active");
  const { data: contests } = await cq;
  const ids = (contests ?? []).map((c) => c.id as string);
  if (ids.length === 0) return { graded: 0 };

  const cushion = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const { data: rows } = await admin
    .from("v2_matchups").select("id, start_time, external_ref, result").in("contest_id", ids).is("result", null);
  const due = (rows ?? [])
    .map((r) => ({ id: r.id as string, start_time: r.start_time as string | null, ref: (r.external_ref as { espn_event_id?: string; league?: string } | null) || {} }))
    .filter((r) => r.ref.espn_event_id && r.ref.league && (!r.start_time || r.start_time <= cushion));
  if (due.length === 0) return { graded: 0 };

  let graded = 0;
  for (const r of due) {
    const score = await fetchGameScore(r.ref.league as string, r.ref.espn_event_id as string);
    if (!score || score.state !== "post") continue;
    const a = score.away?.total, h = score.home?.total;
    if (a == null || h == null) continue;
    const { error } = await admin
      .from("v2_matchups")
      .update({ result: { winner: a === h ? null : a > h ? "a" : "b", score_a: a, score_b: h }, status: "final", updated_at: new Date().toISOString() })
      .eq("id", r.id);
    if (!error) graded += 1;
  }
  return { graded };
}

/** Delete one game from the slate (admin). */
export async function deleteGame(admin: SupabaseClient, contestId: string, gameId: string | null): Promise<PickemResult<null>> {
  if (!gameId) return { ok: false, status: 400, error: "gameId required" };
  const { error } = await admin.from("v2_matchups").delete().eq("id", gameId).eq("contest_id", contestId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Reset: clear everyone's picks. Game slate + results stay. */
export async function resetPicks(admin: SupabaseClient, contestId: string): Promise<PickemResult<null>> {
  const { error } = await admin.from("v2_picks").delete().eq("contest_id", contestId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Save one member pick. Picks lock at the earliest kickoff. */
export async function submitPick(
  admin: SupabaseClient, contestId: string, userId: string, body: SubmitPickInput, now: Date, contestStatus: string,
): Promise<PickemResult<null>> {
  if (!body.gameId) return { ok: false, status: 400, error: "gameId required" };

  const { data: game } = await admin.from("v2_matchups").select("id, contest_id, start_time").eq("id", body.gameId).maybeSingle();
  if (!game || game.contest_id !== contestId) return { ok: false, status: 404, error: "Game not found" };
  if (contestStatus !== "active") return { ok: false, status: 403, error: "Pick'em isn't open" };

  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  const lockMode = lockModeOf(contest?.config as Record<string, unknown> | null);
  const { data: games } = await admin.from("v2_matchups").select("start_time").eq("contest_id", contestId);
  const asGames = (games || []).map((g) => ({ game_time: g.start_time })) as PickemGame[];
  if (gameLocked({ game_time: (game as { start_time: string | null }).start_time } as PickemGame, lockMode, slateLockAt(asGames), now)) {
    return { ok: false, status: 403, error: "Picks are locked" };
  }

  const side = teamToFav(body.pickedTeam);
  const tb = typeof body.tiebreakerTotal === "number" && body.tiebreakerTotal >= 0 ? Math.round(body.tiebreakerTotal) : null;
  const { error } = await admin.from("v2_picks").upsert(
    { matchup_id: body.gameId, contest_id: contestId, user_id: userId, pick: side ? { side } : null, tiebreaker: tb, updated_at: new Date().toISOString() },
    { onConflict: "matchup_id,user_id" },
  );
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Create a Pick'em contest. `eventId` string = event-scoped; null = group-scoped. */
export async function createPickem(
  admin: SupabaseClient, input: { orgId: string; eventId: string | null; name: string; createdBy: string },
): Promise<{ id: string }> {
  const { data, error } = await admin
    .from("v2_contests")
    .insert({
      org_id: input.orgId, event_id: input.eventId, contest_type: "pickem", name: input.name,
      scoring_source: "derived", status: "draft", auto_enroll: false, created_by: input.createdBy,
    })
    .select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the contest");
  return { id: data.id as string };
}

/** One leaderboard row — matches `PickemContent`'s `LeaderEntry` shape. */
export interface PickemLeaderEntry {
  userId: string; name: string; avatarUrl: string | null;
  correct: number; decided: number; pickedCount: number;
  tiebreakerTotal: number | null; tiebreakerDiff: number | null; rank: number;
  picks: { gameId: string; pickedTeam: "away" | "home" | null }[] | null;
}

export interface PickemBoard {
  games: PickemGame[];
  leaderboard: PickemLeaderEntry[];
  myPicks: Record<string, { picked: "away" | "home" | null; tiebreaker: number | null }>;
  locked: boolean;          // every game is locked (all started)
  lockedGameIds: string[];  // games whose picking is closed (per lock_mode)
  lockMode: LockMode;
  totalGames: number;
}

/** Load everything the member Pick'em UI needs for one contest. Individual picks are
 *  revealed only once the slate locks. */
export async function loadPickemBoard(
  supabase: SupabaseClient, input: { contestId: string; orgId: string; viewerId: string; now: Date },
): Promise<PickemBoard> {
  const { data: gameRows } = await supabase
    .from("v2_matchups").select(MATCHUP_SELECT).eq("contest_id", input.contestId)
    .order("sort_order").order("start_time");
  const games = ((gameRows || []) as unknown as MatchupRow[]).map(matchupToPickemGame) as PickemGame[];
  const gameIds = games.map((g) => g.id);

  const { data: pickRows } = gameIds.length
    ? await supabase.from("v2_picks").select("matchup_id, user_id, pick, tiebreaker").in("matchup_id", gameIds)
    : { data: [] as { matchup_id: string; user_id: string; pick: { side?: Side } | null; tiebreaker: number | null }[] };
  const picks: PickemPick[] = (pickRows || []).map((p) => ({
    game_id: p.matchup_id as string, user_id: p.user_id as string,
    picked_team: favToTeam((p.pick as { side?: Side } | null)?.side), tiebreaker_total: (p.tiebreaker as number | null) ?? null,
  }));

  const { data: contest } = await supabase.from("v2_contests").select("config").eq("id", input.contestId).maybeSingle();
  const lockMode = lockModeOf(contest?.config as Record<string, unknown> | null);
  const slateLock = slateLockAt(games);
  const lockedSet = new Set(games.filter((g) => gameLocked(g, lockMode, slateLock, input.now)).map((g) => g.id));
  const locked = games.length > 0 && games.every((g) => lockedSet.has(g.id));
  const ranked = rankPickem(games, picks);

  const userIds = [...new Set(picks.map((p) => p.user_id))];
  const [{ data: profs }, mode] = await Promise.all([
    userIds.length
      ? supabase.from("v2_profiles").select("id, display_name, first_name, last_name, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null }[] }),
    orgNameMode(supabase, input.orgId),
  ]);
  const prof = new Map((profs || []).map((p) => [p.id as string, p]));

  // Reveal a user's pick on a game only once THAT game is locked (per lock_mode) — so
  // you can't peek at picks for a game that hasn't started.
  const picksByUser = new Map<string, PickemPick[]>();
  for (const p of picks) if (lockedSet.has(p.game_id)) (picksByUser.get(p.user_id) || picksByUser.set(p.user_id, []).get(p.user_id)!).push(p);

  const leaderboard: PickemLeaderEntry[] = ranked.map((r) => ({
    userId: r.userId,
    name: prof.has(r.userId) ? pickName(prof.get(r.userId)!, mode) : "Member",
    avatarUrl: (prof.get(r.userId)?.avatar_url as string | null) ?? null,
    correct: r.correct, decided: r.decided, pickedCount: r.pickedCount,
    tiebreakerTotal: r.tiebreakerTotal, tiebreakerDiff: r.tiebreakerDiff, rank: r.rank,
    picks: (picksByUser.get(r.userId) || []).map((p) => ({ gameId: p.game_id, pickedTeam: p.picked_team })),
  }));

  const myPicks: Record<string, { picked: "away" | "home" | null; tiebreaker: number | null }> = {};
  for (const p of picks) if (p.user_id === input.viewerId) myPicks[p.game_id] = { picked: p.picked_team, tiebreaker: p.tiebreaker_total };

  return { games, leaderboard, myPicks, locked, lockedGameIds: [...lockedSet], lockMode, totalGames: games.length };
}
