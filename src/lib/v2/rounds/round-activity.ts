import type { SupabaseClient } from "@supabase/supabase-js";
import { logActivity } from "@/lib/v2/activity";

/**
 * Activity-feed producers for rounds. A round in progress shows a single LIVE
 * entry; on completion that entry is removed and replaced with one score entry
 * per Loozer (or a single team entry for a scramble). All best-effort — never
 * let a feed write break the round action.
 *
 * All keyed to `v2_rounds.org_id` (the group the round was logged under). If a
 * round has no org (imported/historical), these no-op.
 */

/** Resolve an org's slug for building in-app links. */
export async function orgSlug(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await admin.from("v2_organizations").select("slug").eq("id", orgId).maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/** Remove every activity row tied to this round (live entry + score entries). */
export async function clearRoundActivity(admin: SupabaseClient, roundId: string): Promise<void> {
  try {
    await admin.from("v2_activity").delete().eq("ref_id", roundId).eq("kind", "round");
  } catch {
    /* best-effort */
  }
}

/** Log the single "round in progress" entry. */
export async function logLiveRound(
  admin: SupabaseClient,
  opts: { orgId: string; slug: string; roundId: string; creatorId: string; courseName: string; subtitle: string | null },
): Promise<void> {
  await logActivity(admin, {
    orgId: opts.orgId,
    kind: "round",
    actorId: opts.creatorId,
    title: opts.courseName,
    subtitle: opts.subtitle,
    link: `/new/${opts.slug}/rounds/${opts.roundId}`,
    refId: opts.roundId,
    metadata: { live: true },
  }).catch(() => {});
}

export interface RoundScoreEntry {
  actorId: string | null;
  score: number | null;
  toPar: number | null;
}

/** Log a completed round's scores: one row per Loozer (or a single team row). */
export async function logRoundScores(
  admin: SupabaseClient,
  opts: { orgId: string; slug: string; roundId: string; courseName: string; subtitle?: string | null; entries: RoundScoreEntry[] },
): Promise<void> {
  const link = `/new/${opts.slug}/rounds/${opts.roundId}`;
  for (const e of opts.entries) {
    await logActivity(admin, {
      orgId: opts.orgId,
      kind: "round",
      actorId: e.actorId,
      title: opts.courseName,
      subtitle: opts.subtitle ?? null,
      link,
      refId: opts.roundId,
      metadata: { score: e.score, toPar: e.toPar },
    }).catch(() => {});
  }
}
