import { createAdminClient } from "@/lib/supabase/admin";
import {
  sendBulkNotifications,
  sendNotification,
} from "@/lib/notifications/service";

/**
 * Favorite Loozers (issue #140). Fans notifications out to everyone who has
 * favorited a given player, filtered by the per-favorite toggle for the event.
 *
 * All three entry points are best-effort: any failure is swallowed so a
 * notification problem never blocks scoring or round lifecycle writes.
 * Simulator suppression is handled inside sendBulkNotifications /
 * sendNotification (isSimulatingTrip), so no extra guard is needed here.
 *
 * The service worker (public/sw.js) routes a notification click via `data.url`.
 * Every favorite notification deep-links to the read-only spectator scorecard
 * at `/rounds/{id}/watch`.
 */

const WATCH_URL = (roundId: string) => `/rounds/${roundId}/watch`;

/** Which favoriters opted into this event for this player. */
async function getFollowerIds(
  playerUserId: string,
  prefColumn:
    | "notify_round_started"
    | "notify_hole_completed"
    | "notify_round_completed"
): Promise<string[]> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("user_favorites")
    .select("user_id")
    .eq("favorite_user_id", playerUserId)
    .eq(prefColumn, true);
  // A favoriter can't be watching their own play under someone else's id, but
  // guard anyway: never notify the player about their own round.
  return (data || [])
    .map((r) => r.user_id as string)
    .filter((id) => id && id !== playerUserId);
}

/**
 * User ids of everyone on this round's roster (guests excluded). Used to
 * suppress favorite notifications for a follower who is themselves playing in
 * the round — they're standing right there and don't need a push for the guy
 * in their cart (issue #140 follow-up).
 */
async function getRoundParticipantIds(roundId: string): Promise<Set<string>> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("round_players")
    .select("user_id")
    .eq("round_id", roundId)
    .not("user_id", "is", null);
  return new Set((data || []).map((r) => r.user_id as string).filter(Boolean));
}

async function roundContext(roundId: string, playerUserId: string) {
  const admin = createAdminClient();
  const [{ data: round }, { data: player }] = await Promise.all([
    admin
      .from("rounds")
      .select("id, course:courses(name)")
      .eq("id", roundId)
      .single(),
    admin
      .from("users")
      .select("display_name")
      .eq("id", playerUserId)
      .maybeSingle(),
  ]);
  const course = Array.isArray(round?.course) ? round?.course[0] : round?.course;
  return {
    courseName: (course as { name?: string } | null)?.name || "a round",
    playerName: player?.display_name || "A Loozer",
  };
}

/** They started a live round — "Rounds Played" toggle. */
export async function notifyFavoritesRoundStarted({
  roundId,
  playerUserId,
}: {
  roundId: string;
  playerUserId: string;
}): Promise<void> {
  try {
    const followers = await getFollowerIds(playerUserId, "notify_round_started");
    if (followers.length === 0) return;

    // Don't notify a follower who is playing in this same round.
    const participants = await getRoundParticipantIds(roundId);
    const targets = followers.filter((id) => !participants.has(id));
    if (targets.length === 0) return;

    const { courseName, playerName } = await roundContext(roundId, playerUserId);
    await sendBulkNotifications(targets, {
      type: "favorite_round_started",
      title: `${playerName} started a round`,
      body: courseName,
      data: {
        round_id: roundId,
        actor_user_id: playerUserId,
        url: WATCH_URL(roundId),
      },
    });
  } catch (err) {
    console.error("[notifyFavoritesRoundStarted] failed", err);
  }
}

/** They finished — "Round Finished" toggle. */
export async function notifyFavoritesRoundCompleted({
  roundId,
  playerUserId,
  scoreLine,
}: {
  roundId: string;
  playerUserId: string;
  scoreLine?: string | null;
}): Promise<void> {
  try {
    const followers = await getFollowerIds(
      playerUserId,
      "notify_round_completed"
    );
    if (followers.length === 0) return;

    // Don't notify a follower who is playing in this same round.
    const participants = await getRoundParticipantIds(roundId);
    const targets = followers.filter((id) => !participants.has(id));
    if (targets.length === 0) return;

    const { courseName, playerName } = await roundContext(roundId, playerUserId);
    await sendBulkNotifications(targets, {
      type: "favorite_round_completed",
      title: `${playerName} finished a round`,
      body: scoreLine || courseName,
      data: {
        round_id: roundId,
        actor_user_id: playerUserId,
        url: WATCH_URL(roundId),
      },
    });
  } catch (err) {
    console.error("[notifyFavoritesRoundCompleted] failed", err);
  }
}

export interface HoleTransition {
  playerUserId: string;
  playerName: string;
  hole: number;
  strokes: number;
  par: number | null;
  // Cumulative score relative to par across every scored hole after this save,
  // and how many holes that covers ("3 over thru 7"). Optional so callers that
  // only know the single-hole result can still fire a notification.
  standingToPar?: number | null;
  holesPlayed?: number;
}

/** Relative-to-par label for a hole score. */
function holeLabel(strokes: number, par: number | null): string {
  if (par == null) return `${strokes}`;
  const diff = strokes - par;
  if (strokes === 1) return "1 (ace)";
  if (diff <= -3) return `${strokes} (albatross)`;
  if (diff === -2) return `${strokes} (eagle)`;
  if (diff === -1) return `${strokes} (birdie)`;
  if (diff === 0) return `${strokes} (par)`;
  if (diff === 1) return `${strokes} (bogey)`;
  return `${strokes} (+${diff})`;
}

/**
 * Named result for a single hole, e.g. "a birdie" — used for the title so it
 * reads "Whitey had a birdie" instead of the generic "Whitey carded a hole".
 * Returns null when par is unknown so the caller can fall back.
 */
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

/**
 * Cumulative-to-par standing for the body, e.g. "3 over thru 7", "even thru 7",
 * "2 under thru 7". Null when we couldn't compute it (no par data).
 */
function standingPhrase(
  toPar: number | null | undefined,
  holesPlayed: number | undefined
): string | null {
  if (toPar == null || !holesPlayed || holesPlayed <= 0) return null;
  const rel =
    toPar === 0 ? "even" : toPar > 0 ? `${toPar} over` : `${Math.abs(toPar)} under`;
  return `${rel} thru ${holesPlayed}`;
}

/**
 * Hole-by-hole — "Hole-by-Hole Updates" toggle. Coalesced PER REQUEST by
 * follower: a scorer may record holes for several players in one save, and a
 * follower may follow several of those players. Each such follower gets ONE
 * push summarizing every followed player's newly-scored hole, e.g.
 *   "Hole 5 — Randy: 4 (birdie), Steve: 3 (eagle)"
 *
 * Pass ONLY first-score (null→value) transitions for roster rows that have a
 * real user_id (guests are skipped upstream). Edits must never reach here.
 */
export async function notifyFavoritesHolesScored({
  roundId,
  transitions,
}: {
  roundId: string;
  transitions: HoleTransition[];
}): Promise<void> {
  try {
    if (transitions.length === 0) return;

    const playerIds = [...new Set(transitions.map((t) => t.playerUserId))];

    const admin = createAdminClient();
    const { data: favRows } = await admin
      .from("user_favorites")
      .select("user_id, favorite_user_id")
      .in("favorite_user_id", playerIds)
      .eq("notify_hole_completed", true);

    if (!favRows || favRows.length === 0) return;

    // follower -> set of player ids they follow (in this round)
    const followerToPlayers = new Map<string, Set<string>>();
    for (const row of favRows) {
      const follower = row.user_id as string;
      const player = row.favorite_user_id as string;
      if (follower === player) continue;
      if (!followerToPlayers.has(follower))
        followerToPlayers.set(follower, new Set());
      followerToPlayers.get(follower)!.add(player);
    }
    if (followerToPlayers.size === 0) return;

    // Suppress pushes to a follower who is themselves playing in this round —
    // they don't want a buzz every hole for the guy in their cart (issue #140).
    const participants = await getRoundParticipantIds(roundId);
    for (const p of participants) followerToPlayers.delete(p);
    if (followerToPlayers.size === 0) return;

    // Send one personalized push per follower.
    await Promise.allSettled(
      [...followerToPlayers.entries()].map(([follower, players]) => {
        const relevant = transitions.filter((t) => players.has(t.playerUserId));
        // Order by hole for a stable readable summary.
        relevant.sort((a, b) => a.hole - b.hole);

        // Each segment carries the hole score AND the player's running standing
        // relative to par so a watcher sees both "what they got" and "how many
        // over par they are" (issue #140 follow-up).
        const segments = relevant.map((t) => {
          const base = `Hole ${t.hole} — ${t.playerName}: ${holeLabel(t.strokes, t.par)}`;
          const standing = standingPhrase(t.standingToPar, t.holesPlayed);
          return standing ? `${base} · ${standing}` : base;
        });
        const body = segments.join("; ");

        // Name the result in the title for the common single-hole case:
        // "Whitey had a birdie" instead of "Whitey carded a hole".
        let title: string;
        if (relevant.length === 1) {
          const t = relevant[0];
          const phrase = resultPhrase(t.strokes, t.par);
          title = phrase
            ? `${t.playerName} had ${phrase}`
            : `${t.playerName} carded a hole`;
        } else {
          title = "Live scoring update";
        }

        return sendNotification(follower, {
          type: "favorite_hole_completed",
          title,
          body,
          data: {
            round_id: roundId,
            url: WATCH_URL(roundId),
          },
        });
      })
    );
  } catch (err) {
    console.error("[notifyFavoritesHolesScored] failed", err);
  }
}
