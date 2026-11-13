/**
 * "3s and Ds" server helpers. The activity reuses the contest spine (one no-fee
 * manual row), a single v2_matchups row for the current ESPN game (teams/logos +
 * the live-score hook), and v2_3s_events for the manual event log.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addEspnGames, type EspnGameInput } from "@/lib/v2/contests/pickem-server";
import { defaultReactions, type ThreesReactions, type ThreesEventRow, type ThreesTeam, type AndOnePotential } from "@/lib/v2/contests/threes";

export interface ThreesCompetitor {
  name: string;
  shortName: string; // school/location, no mascot (falls back to name on older games)
  abbrev: string | null;
  logo: string | null;
  color: string | null;
  espn_id?: string | null;
}

export interface ThreesGame {
  matchupId: string;
  league: string | null;
  espnEventId: string | null;
  teamA: ThreesCompetitor; // ESPN away
  teamB: ThreesCompetitor; // ESPN home
  startTime: string | null;
  status: string;
}

export interface ThreesState {
  contest: { id: string; name: string; status: string; org_id: string; event_id: string | null };
  reactions: ThreesReactions;
  streakCap: number | null;
  game: ThreesGame | null;
  events: ThreesEventRow[];
  /** Pending "And 1" (a made basket + foul), held on the board until resolved.
   *  `potential` = whether a made FT completes a 3- or 4-point play. `gif` is
   *  chosen once server-side so every board view shows the same one. */
  andOne: { team: ThreesTeam; potential: AndOnePotential; gif: string | null } | null;
}

function competitorOf(raw: unknown): ThreesCompetitor {
  const c = (raw as Record<string, unknown> | null) ?? {};
  const name = (c.name as string) || (c.abbrev as string) || "Team";
  return {
    name,
    shortName: (c.short_name as string) || name,
    abbrev: (c.abbrev as string) ?? null,
    logo: (c.logo as string) ?? null,
    color: (c.color as string) ?? null,
    espn_id: (c.espn_id as string) ?? null,
  };
}

/**
 * Group-level reaction config (animations / sounds / GIF picks + max-streak).
 * One row per org in v2_3s_settings; every 3s-and-Ds game uses it. A missing row
 * means app defaults (default animations, no GIFs, bundled sound, streak cap 5).
 */
export async function loadThreesSettings(
  supabase: SupabaseClient,
  orgId: string,
): Promise<{ reactions: ThreesReactions; streakCap: number | null }> {
  const { data } = await supabase
    .from("v2_3s_settings")
    .select("reactions, streak_cap")
    .eq("org_id", orgId)
    .maybeSingle();

  const raw = data?.reactions as ThreesReactions | undefined;
  const reactions =
    raw && typeof raw === "object" && Object.keys(raw).length
      ? { ...defaultReactions(), ...raw }
      : defaultReactions();

  let streakCap: number | null = 5;
  if (data) {
    const v = data.streak_cap;
    streakCap = v === null ? null : typeof v === "number" && v > 0 ? Math.floor(v) : 5;
  }
  return { reactions, streakCap };
}

/** Upsert the group's reaction config. Admin-gated at the API layer. */
export async function saveThreesSettings(
  admin: SupabaseClient,
  orgId: string,
  reactions: ThreesReactions,
  streakCap: number | null,
  userId: string,
): Promise<{ error?: string }> {
  const cap = streakCap === null ? null : Math.max(1, Math.floor(streakCap));
  const { error } = await admin
    .from("v2_3s_settings")
    .upsert(
      { org_id: orgId, reactions, streak_cap: cap, updated_by: userId, updated_at: new Date().toISOString() },
      { onConflict: "org_id" },
    );
  return { error: error?.message };
}

/** Load everything the manage view / scorer / board needs for a 3s-and-Ds activity. */
export async function loadThreesState(
  supabase: SupabaseClient,
  contestId: string,
): Promise<ThreesState | null> {
  const { data: contest } = await supabase
    .from("v2_contests")
    .select("id, name, status, org_id, event_id, contest_type, config")
    .eq("id", contestId)
    .maybeSingle();
  if (!contest || contest.contest_type !== "3s_and_ds") return null;

  const [settings, { data: matchup }, { data: events }] = await Promise.all([
    loadThreesSettings(supabase, contest.org_id),
    supabase
      .from("v2_matchups")
      .select("id, competitor_a, competitor_b, external_ref, start_time, status")
      .eq("contest_id", contestId)
      .order("sort_order", { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("v2_3s_events")
      .select("id, team, event_type, points, result, created_at, gif_url")
      .eq("contest_id", contestId)
      .order("created_at", { ascending: true }),
  ]);

  const cfg = (contest.config as Record<string, unknown> | null) ?? null;
  const ao = cfg?.and_one as { team?: unknown; potential?: unknown; gif?: unknown } | null;
  const andOne =
    ao?.team === "a" || ao?.team === "b"
      ? {
          team: ao.team as ThreesTeam,
          potential: (ao.potential === 4 ? 4 : 3) as AndOnePotential,
          gif: typeof ao.gif === "string" ? ao.gif : null,
        }
      : null;

  const ext = (matchup?.external_ref as Record<string, unknown> | null) ?? null;
  const game: ThreesGame | null = matchup
    ? {
        matchupId: matchup.id,
        league: (ext?.espn_league as string) ?? (ext?.league as string) ?? null,
        espnEventId: (ext?.espn_event_id as string) ?? null,
        teamA: competitorOf(matchup.competitor_a),
        teamB: competitorOf(matchup.competitor_b),
        startTime: (matchup.start_time as string) ?? null,
        status: (matchup.status as string) ?? "scheduled",
      }
    : null;

  return {
    contest: {
      id: contest.id,
      name: contest.name,
      status: contest.status,
      org_id: contest.org_id,
      event_id: contest.event_id,
    },
    reactions: settings.reactions,
    streakCap: settings.streakCap,
    game,
    events: (events ?? []) as ThreesEventRow[],
    andOne,
  };
}

/**
 * Set or clear the pending "And 1" for a game (live per-game state in the
 * contest config). Pass a team to raise it, or null to dismiss. Merges so other
 * config keys survive; writing bumps v2_contests → realtime pushes to the board.
 */
export async function setPendingAndOne(
  admin: SupabaseClient,
  contestId: string,
  team: ThreesTeam | null,
  potential: AndOnePotential = 3,
  gif: string | null = null,
): Promise<{ error?: string }> {
  const { data } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  const config: Record<string, unknown> = { ...((data?.config as Record<string, unknown> | null) ?? {}) };
  if (team) config.and_one = { team, potential, gif };
  else delete config.and_one;
  const { error } = await admin.from("v2_contests").update({ config }).eq("id", contestId);
  return { error: error?.message };
}

/** The activity's display name = the matchup, e.g. "NIU vs. BGSU". */
export function matchupName(game: EspnGameInput): string {
  const a = game.away?.abbrev || game.away?.name || "Away";
  const b = game.home?.abbrev || game.home?.name || "Home";
  return `${a} vs. ${b}`;
}

/**
 * Set (replace) the current ESPN game: clears the old game + its events, adds the
 * new one, and renames the activity to the matchup. The reaction config is kept.
 */
export async function setThreesGame(
  admin: SupabaseClient,
  contestId: string,
  game: EspnGameInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await admin.from("v2_3s_events").delete().eq("contest_id", contestId);
  await admin.from("v2_matchups").delete().eq("contest_id", contestId);
  const r = await addEspnGames(admin, contestId, [game]);
  if (!r.ok) return { ok: false, error: r.error };
  await admin.from("v2_contests").update({ name: matchupName(game) }).eq("id", contestId);
  await setPendingAndOne(admin, contestId, null); // never carry a pending And-1 into a new game
  return { ok: true };
}

/** Clear the game + events entirely (back to the empty "waiting for a game" state). */
export async function clearThreesGame(admin: SupabaseClient, contestId: string): Promise<void> {
  await admin.from("v2_3s_events").delete().eq("contest_id", contestId);
  await admin.from("v2_matchups").delete().eq("contest_id", contestId);
  await setPendingAndOne(admin, contestId, null);
}
