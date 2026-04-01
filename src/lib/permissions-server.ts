import { createClient } from "@/lib/supabase/server";
import { hasAnyEventPermission } from "@/lib/permissions";

/**
 * Shared API route helper: checks if the current user is an admin OR has
 * the specified permission key. Returns the authenticated user or null.
 */
export async function checkPermissionAccess(permissionKey: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, permissions")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const perms = profile.permissions as Record<string, boolean> | null;
  if (!profile.is_admin && !perms?.[permissionKey]) return null;

  return user;
}

/**
 * Shared API route helper: checks if the current user is an admin OR has
 * any event-level permission. Returns the authenticated user or null.
 */
export async function checkAnyEventAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, permissions")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  if (profile.is_admin) return user;

  const perms = profile.permissions as Record<string, boolean> | null;
  if (hasAnyEventPermission(perms)) return user;

  return null;
}
