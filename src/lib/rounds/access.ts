import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

export type RoundAccess =
  | { allowed: true; reason: "creator" | "player" | "admin" }
  | { allowed: false; reason: "not_found" | "denied" };

/**
 * Co-equal round ownership gate. Any player in the round (creator or not),
 * or any app admin, can manage the round — edit scores, complete, post-edit,
 * delete, add/remove players. Issue #130.
 *
 * Returns granted reason for telemetry / audit, or denial reason for the
 * caller to map to an HTTP status (404 vs. 403).
 */
export async function canManageRound(
  roundId: string,
  effectiveUserId: string,
): Promise<RoundAccess> {
  const admin = createAdminClient();
  const { data: round } = await admin
    .from("rounds")
    .select("created_by")
    .eq("id", roundId)
    .maybeSingle();
  if (!round) return { allowed: false, reason: "not_found" };

  if (round.created_by === effectiveUserId) {
    return { allowed: true, reason: "creator" };
  }

  const { data: playerRow } = await admin
    .from("round_players")
    .select("id")
    .eq("round_id", roundId)
    .eq("user_id", effectiveUserId)
    .maybeSingle();
  if (playerRow) return { allowed: true, reason: "player" };

  const adminUser = await checkIsAdmin();
  if (adminUser) return { allowed: true, reason: "admin" };

  return { allowed: false, reason: "denied" };
}
