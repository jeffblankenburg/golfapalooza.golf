import { createHmac } from "crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { v2AdminClient } from "./supabase";

/**
 * User simulator (dev/admin tooling). Lets a group owner/admin view the app AS
 * another member of an org they administer — invaluable for testing anything only
 * other people can see (notifications, follows, rosters, visibility rules).
 *
 * Security: the `v2_sim_user` cookie is NEVER trusted on its own. Every request
 * re-verifies (via `canSimulate`) that the REAL user is an owner/admin of an org
 * the target belongs to, so a hand-set cookie can't impersonate anyone.
 *
 * Mechanism: the two identity chokepoints — `v2GetUser` (APIs) and
 * `getPlatformContext` (pages) — resolve the EFFECTIVE user id here, so the whole
 * app acts as the simulated user with no per-route changes. The RLS-scoped client
 * stays bound to the real session; v2 reads/writes overwhelmingly go through the
 * service-role client filtered by the effective `userId`, which is what we swap.
 */

export const SIM_USER_COOKIE = "v2_sim_user";

export const getSimUserCookie = cache(async (): Promise<string | null> => {
  const store = await cookies();
  return store.get(SIM_USER_COOKIE)?.value || null;
});

/**
 * May `realUserId` simulate `targetUserId`? Only when the real user is an active
 * owner/admin of some org the target is also an active member of.
 */
export async function canSimulate(
  admin: ReturnType<typeof v2AdminClient>,
  realUserId: string,
  targetUserId: string,
): Promise<boolean> {
  if (!realUserId || !targetUserId || realUserId === targetUserId) return false;

  const { data: adminOrgs } = await admin
    .from("v2_memberships")
    .select("org_id")
    .eq("user_id", realUserId)
    .eq("status", "active")
    .is("archived_at", null)
    .in("role", ["owner", "admin"]);
  const orgIds = (adminOrgs || []).map((m) => m.org_id);
  if (orgIds.length === 0) return false;

  const { data: shared } = await admin
    .from("v2_memberships")
    .select("org_id")
    .eq("user_id", targetUserId)
    .eq("status", "active")
    .is("archived_at", null)
    .in("org_id", orgIds)
    .limit(1);
  return !!(shared && shared.length);
}

export interface EffectiveUser {
  userId: string | null; // who the app acts as (simulated target, or the real user)
  realUserId: string | null; // always the authenticated user
  simulating: boolean;
}

/**
 * Resolve the effective user for an authenticated real user, honoring the sim
 * cookie only when the gate passes. Request-cached so the many callers per request
 * share one gate check.
 */
export const resolveEffectiveUser = cache(async (realUserId: string | null): Promise<EffectiveUser> => {
  if (!realUserId) return { userId: null, realUserId: null, simulating: false };
  const sim = await getSimUserCookie();
  if (!sim || sim === realUserId) return { userId: realUserId, realUserId, simulating: false };
  const ok = await canSimulate(v2AdminClient(), realUserId, sim);
  return ok ? { userId: sim, realUserId, simulating: true } : { userId: realUserId, realUserId, simulating: false };
});

/* ── Time simulator ──────────────────────────────────────────────────────────
 * Override "now" for testing time-gated features. The cookie value is SIGNED
 * (HMAC) so a non-admin can't hand-set it — `v2Now()` runs context-free deep in
 * server code, so we can't re-check admin per call; the signature is the guard.
 * Setting is still gated to org admins at the API. Format: `<iso>~<hmac>`.
 */
export const SIM_AT_COOKIE = "v2_sim_at";

function signSimAt(iso: string): string {
  return createHmac("sha256", process.env.SUPABASE_SERVICE_ROLE_KEY || "").update(iso).digest("hex").slice(0, 32);
}

/** Build the signed cookie value for a chosen ISO datetime. */
export function makeSimAtCookie(iso: string): string {
  return `${iso}~${signSimAt(iso)}`;
}

/** The valid simulated ISO datetime from the cookie, or null. */
export const getSimAt = cache(async (): Promise<string | null> => {
  const store = await cookies();
  const raw = store.get(SIM_AT_COOKIE)?.value;
  if (!raw) return null;
  const i = raw.lastIndexOf("~");
  if (i < 0) return null;
  const iso = raw.slice(0, i);
  const sig = raw.slice(i + 1);
  if (!iso || sig !== signSimAt(iso)) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : iso;
});

/** Effective "now" — the simulated time when set (and validly signed), else real. */
export async function v2Now(): Promise<Date> {
  const iso = await getSimAt();
  return iso ? new Date(iso) : new Date();
}
