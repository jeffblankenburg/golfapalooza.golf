import type { SupabaseClient } from "@supabase/supabase-js";
import { sendV2Notifications } from "@/lib/v2/notifications";
import { orgSlug, orgNameMode } from "@/lib/v2/orgs";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { formatCourseName } from "@/lib/v2/course-display";

/**
 * Follow-a-member spectator notifications — v2 port of src/lib/favorites/fanout.ts
 * (#187 phase 2). Fans a round's activity out to everyone who follows a player,
 * gated by BOTH the per-follow toggle (`v2_user_favorites.notify_*`) AND the
 * global mute for that type. The global mute is handled inside sendV2Notifications
 * because the notification `type` IS the pref key — `notify_round_started` /
 * `notify_hole_completed` / `notify_round_completed` (see notification-prefs.ts,
 * the "following" section).
 *
 * All best-effort: a notification failure never blocks the round write. Org-less
 * (historical/import) and `silent` rounds don't notify. Every push deep-links to
 * the read-only spectator watch page.
 */

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

interface RoundCtx {
  orgId: string;
  slug: string;
  silent: boolean;
  courseName: string;
  nameMode: NameMode;
}

/** Resolve org/slug/course/name-mode for a round, or null if it shouldn't notify. */
async function roundCtx(admin: SupabaseClient, roundId: string): Promise<RoundCtx | null> {
  const { data: round } = await admin
    .from("v2_rounds")
    .select("org_id, silent, course:v2_courses(name, club_name)")
    .eq("id", roundId)
    .maybeSingle();
  if (!round?.org_id) return null;
  const [slug, nameMode] = await Promise.all([orgSlug(admin, round.org_id), orgNameMode(admin, round.org_id)]);
  if (!slug) return null;
  const course = one(round.course);
  return {
    orgId: round.org_id,
    slug,
    silent: !!round.silent,
    courseName: course ? formatCourseName(course) : "a round",
    nameMode,
  };
}

/** Roster user ids (guests excluded) — a follower playing the round is suppressed. */
async function rosterUserIds(admin: SupabaseClient, roundId: string): Promise<Set<string>> {
  const { data } = await admin
    .from("v2_round_players")
    .select("user_id")
    .eq("round_id", roundId)
    .not("user_id", "is", null);
  return new Set((data || []).map((r) => r.user_id as string).filter(Boolean));
}

/** Display names for a set of players, resolved in the org's name mode. */
async function namesByUser(admin: SupabaseClient, userIds: string[], nameMode: NameMode): Promise<Map<string, string>> {
  const ids = [...new Set(userIds)].filter(Boolean);
  if (ids.length === 0) return new Map();
  const { data } = await admin
    .from("v2_profiles")
    .select("id, display_name, first_name, last_name, nickname")
    .in("id", ids);
  return new Map((data || []).map((p) => [p.id, pickName(p, nameMode, "A member")]));
}

/** Followers of a player who opted into `toggle`, minus the player + roster. */
async function followersFor(
  admin: SupabaseClient,
  playerUserId: string,
  toggle: "notify_round_started" | "notify_round_completed",
  roster: Set<string>,
): Promise<string[]> {
  const { data } = await admin
    .from("v2_user_favorites")
    .select("follower_id")
    .eq("favorite_user_id", playerUserId)
    .eq(toggle, true);
  return (data || [])
    .map((r) => r.follower_id as string)
    .filter((id) => id && id !== playerUserId && !roster.has(id));
}

const watchUrl = (slug: string, roundId: string) => `/new/${slug}/rounds/${roundId}/watch`;

function toParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`; // proper minus sign
}

/** Named hole result ("a birdie"), or null when par is unknown. */
function resultPhrase(strokes: number, par: number | null): string | null {
  if (par == null) return null;
  const diff = strokes - par;
  if (strokes === 1) return "a hole-in-one";
  if (diff <= -3) return "an albatross";
  if (diff === -2) return "an eagle";
  if (diff === -1) return "a birdie";
  if (diff === 0) return "a par";
  if (diff === 1) return "a bogey";
  if (diff === 2) return "a double bogey";
  if (diff === 3) return "a triple bogey";
  return `a +${diff}`;
}

/** Cumulative-to-par standing, e.g. "+3 thru 7" / "E thru 7". Null when unknown. */
function standingTag(toPar: number | null | undefined, holesPlayed: number | undefined): string | null {
  if (toPar == null || !holesPlayed || holesPlayed <= 0) return null;
  const rel = toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `−${Math.abs(toPar)}`;
  return `${rel} thru ${holesPlayed}`;
}

/** They teed off — "Round started" toggle. One push per followed player. */
export async function notifyFavoritesRoundStarted(
  admin: SupabaseClient,
  { roundId, playerUserIds }: { roundId: string; playerUserIds: string[] },
): Promise<void> {
  try {
    const ctx = await roundCtx(admin, roundId);
    if (!ctx || ctx.silent) return;
    const players = [...new Set(playerUserIds)].filter(Boolean);
    if (players.length === 0) return;

    const roster = await rosterUserIds(admin, roundId);
    const names = await namesByUser(admin, players, ctx.nameMode);
    const url = watchUrl(ctx.slug, roundId);

    for (const pid of players) {
      const targets = await followersFor(admin, pid, "notify_round_started", roster);
      if (targets.length === 0) continue;
      await sendV2Notifications(admin, targets, {
        orgId: ctx.orgId,
        type: "notify_round_started",
        title: `${names.get(pid) || "A member"} started a round`,
        body: ctx.courseName,
        data: { url, roundId },
      });
    }
  } catch {
    /* best-effort */
  }
}

/** They finished — "Round finished" toggle. */
export async function notifyFavoritesRoundCompleted(
  admin: SupabaseClient,
  { roundId, players }: { roundId: string; players: { userId: string | null; score: number | null; par: number }[] },
): Promise<void> {
  try {
    const ctx = await roundCtx(admin, roundId);
    if (!ctx || ctx.silent) return;
    const valid = players.filter((p): p is { userId: string; score: number | null; par: number } => !!p.userId);
    if (valid.length === 0) return;

    const roster = await rosterUserIds(admin, roundId);
    const names = await namesByUser(admin, valid.map((p) => p.userId), ctx.nameMode);
    const url = watchUrl(ctx.slug, roundId);

    for (const p of valid) {
      const targets = await followersFor(admin, p.userId, "notify_round_completed", roster);
      if (targets.length === 0) continue;
      const line = p.score != null ? `${p.score} (${toParLabel(p.score - p.par)})` : ctx.courseName;
      await sendV2Notifications(admin, targets, {
        orgId: ctx.orgId,
        type: "notify_round_completed",
        title: `${names.get(p.userId) || "A member"} finished a round`,
        body: line,
        data: { url, roundId },
      });
    }
  } catch {
    /* best-effort */
  }
}

export interface HoleTransition {
  playerUserId: string;
  hole: number;
  strokes: number;
  par: number | null;
  standingToPar?: number | null;
  holesPlayed?: number;
}

/**
 * Hole-by-hole — "Hole-by-hole" toggle. Coalesced PER FOLLOWER: one push summing
 * every followed player's newly-scored hole in this save. Pass ONLY first-score
 * (null→value) transitions for roster rows with a real user_id — edits never reach
 * here.
 */
export async function notifyFavoritesHolesScored(
  admin: SupabaseClient,
  { roundId, transitions }: { roundId: string; transitions: HoleTransition[] },
): Promise<void> {
  try {
    if (transitions.length === 0) return;
    const ctx = await roundCtx(admin, roundId);
    if (!ctx || ctx.silent) return;

    const playerIds = [...new Set(transitions.map((t) => t.playerUserId))];
    const { data: favRows } = await admin
      .from("v2_user_favorites")
      .select("follower_id, favorite_user_id")
      .in("favorite_user_id", playerIds)
      .eq("notify_hole_completed", true);
    if (!favRows || favRows.length === 0) return;

    // follower -> set of followed players (in this round's save)
    const followerToPlayers = new Map<string, Set<string>>();
    for (const row of favRows) {
      const f = row.follower_id as string;
      const p = row.favorite_user_id as string;
      if (f === p) continue;
      let set = followerToPlayers.get(f);
      if (!set) {
        set = new Set();
        followerToPlayers.set(f, set);
      }
      set.add(p);
    }

    // Suppress a follower who is themselves playing in this round.
    const roster = await rosterUserIds(admin, roundId);
    for (const p of roster) followerToPlayers.delete(p);
    if (followerToPlayers.size === 0) return;

    const names = await namesByUser(admin, playerIds, ctx.nameMode);
    const url = watchUrl(ctx.slug, roundId);

    await Promise.allSettled(
      [...followerToPlayers.entries()].map(([follower, players]) => {
        const relevant = transitions.filter((t) => players.has(t.playerUserId)).sort((a, b) => a.hole - b.hole);
        if (relevant.length === 0) return Promise.resolve();

        let title: string;
        let body: string;
        if (relevant.length === 1) {
          const t = relevant[0];
          const nm = names.get(t.playerUserId) || "A member";
          const phrase = resultPhrase(t.strokes, t.par);
          title = phrase ? `${nm} had ${phrase}` : `${nm} carded a hole`;
          const tag = standingTag(t.standingToPar, t.holesPlayed);
          body = tag ?? `Hole ${t.hole}: ${t.strokes}`;
        } else {
          title = "Live scoring update";
          body = relevant
            .map((t) => {
              const nm = names.get(t.playerUserId) || "A member";
              const phrase = resultPhrase(t.strokes, t.par) ?? `a ${t.strokes}`;
              const tag = standingTag(t.standingToPar, t.holesPlayed);
              return tag ? `${nm} had ${phrase} (${tag})` : `${nm} had ${phrase} on ${t.hole}`;
            })
            .join("; ");
        }

        return sendV2Notifications(admin, [follower], {
          orgId: ctx.orgId,
          type: "notify_hole_completed",
          title,
          body,
          data: { url, roundId },
        });
      }),
    );
  } catch {
    /* best-effort */
  }
}
