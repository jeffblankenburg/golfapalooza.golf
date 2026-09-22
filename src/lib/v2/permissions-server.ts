import type { SupabaseClient } from "@supabase/supabase-js";
import { memberHasPermission, type PermissionMap } from "./permissions";

/**
 * Does this user hold a permission in this org? True if they're a group
 * owner/admin (implicit all) or the specific key is granted on their membership.
 * Use the service-role client. Mirrors the original checkPermissionAccess, scoped
 * per-org for v2.
 */
export async function hasPermission(
  admin: SupabaseClient,
  userId: string,
  orgId: string,
  key: string,
): Promise<boolean> {
  const { data } = await admin
    .from("v2_memberships")
    .select("role, permissions")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  if (!data) return false;
  return memberHasPermission(data.role as string, data.permissions as PermissionMap | null, key);
}
