import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasAnyEventPermission, hasAnyPermission } from "@/lib/permissions";
import { getSimUserId } from "@/lib/simulator";

/**
 * Get the effective user profile for permission checks.
 * When an admin is simulating another user, returns the SIMULATED user's profile.
 * This ensures that simulation accurately reflects the target user's experience.
 */
async function getEffectiveProfile() {
  const supabase = await createClient();

  // Retry getUser up to 2 times — the edge middleware sandbox occasionally
  // causes transient "fetch failed" errors on the first attempt.
  let user = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.auth.getUser();
    if (data?.user) {
      user = data.user;
      break;
    }
    if (error) {
      console.warn(`getEffectiveProfile: getUser attempt ${attempt + 1} failed:`, error.message);
    }
  }

  if (!user) return null;

  // Get real user's profile to check if they're an admin who can simulate
  const adminClient = createAdminClient();
  const { data: realProfile } = await adminClient
    .from("users")
    .select("is_admin, permissions")
    .eq("id", user.id)
    .single();

  if (!realProfile) return null;

  // If real user is admin and simulating, use the simulated user's profile
  if (realProfile.is_admin) {
    const simUserId = await getSimUserId();
    if (simUserId) {
      const { data: simProfile } = await adminClient
        .from("users")
        .select("is_admin, permissions")
        .eq("id", simUserId)
        .single();

      return {
        authUser: user,
        effectiveUserId: simUserId,
        isAdmin: simProfile?.is_admin ?? false,
        permissions: simProfile?.permissions as Record<string, boolean> | null,
      };
    }
  }

  return {
    authUser: user,
    effectiveUserId: user.id,
    isAdmin: realProfile.is_admin ?? false,
    permissions: realProfile.permissions as Record<string, boolean> | null,
  };
}

/**
 * Check if the effective user (real or simulated) is an admin.
 * Returns the auth user object if authorized, null otherwise.
 */
export async function checkIsAdmin() {
  const profile = await getEffectiveProfile();
  if (!profile || !profile.isAdmin) return null;
  return profile.authUser;
}

/**
 * Check if the effective user is an admin OR has the specified permission.
 */
export async function checkPermissionAccess(permissionKey: string) {
  const profile = await getEffectiveProfile();
  if (!profile) return null;

  if (profile.isAdmin) return profile.authUser;
  if (profile.permissions?.[permissionKey]) return profile.authUser;

  return null;
}

/**
 * Check if the effective user is an admin OR has any event-level permission.
 */
export async function checkAnyEventAccess() {
  const profile = await getEffectiveProfile();
  if (!profile) return null;

  if (profile.isAdmin) return profile.authUser;
  if (hasAnyEventPermission(profile.permissions)) return profile.authUser;

  return null;
}

/**
 * Check if the effective user is an admin OR has any permission at all.
 * Used for read-only endpoints like listing users.
 */
export async function checkAnyPermissionAccess() {
  const profile = await getEffectiveProfile();
  if (!profile) return null;

  if (profile.isAdmin) return profile.authUser;
  if (hasAnyPermission(profile.permissions)) return profile.authUser;

  return null;
}
