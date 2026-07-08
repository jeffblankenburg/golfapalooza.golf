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

    const { courseName, playerName } = await roundContext(roundId, playerUserId);
    await sendBulkNotifications(followers, {
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

    const { courseName, playerName } = await roundContext(roundId, playerUserId);
    await sendBulkNotifications(followers, {
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

    // Send one personalized push per follower.
    await Promise.allSettled(
      [...followerToPlayers.entries()].map(([follower, players]) => {
        const relevant = transitions.filter((t) => players.has(t.playerUserId));
        // Order by hole, then player, for a stable readable summary.
        relevant.sort((a, b) => a.hole - b.hole);
        // Group the summary by hole when a single hole has multiple players.
        const byHole = new Map<number, HoleTransition[]>();
        for (const t of relevant) {
          if (!byHole.has(t.hole)) byHole.set(t.hole, []);
          byHole.get(t.hole)!.push(t);
        }
        const parts = [...byHole.entries()].map(([hole, ts]) => {
          const inner = ts
            .map((t) => `${t.playerName}: ${holeLabel(t.strokes, t.par)}`)
            .join(", ");
          return `Hole ${hole} — ${inner}`;
        });
        const body = parts.join(" · ");
        const title =
          relevant.length === 1
            ? `${relevant[0].playerName} carded a hole`
            : "Live scoring update";

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
