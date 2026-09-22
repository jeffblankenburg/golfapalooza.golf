import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { NameMode } from "./profile";

/** Unguessable, URL-safe, single-use invite code. */
export function genInviteCode(): string {
  return randomBytes(9).toString("base64url"); // 12 url-safe chars
}

/** True if the user is an active owner/admin of the org. Use the service-role client. */
export async function isOrgAdmin(
  admin: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await admin
    .from("v2_memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  return !!data && (data.role === "owner" || data.role === "admin");
}

/**
 * True if the user is an owner/admin of ANY active org. Used to gate actions on
 * universal (non-org-scoped) resources like the shared course library, where
 * "admin" means "a group admin somewhere," not tied to one org.
 */
export async function isAnyOrgAdmin(admin: SupabaseClient, userId: string): Promise<boolean> {
  const { data } = await admin
    .from("v2_memberships")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "active")
    .is("archived_at", null)
    .in("role", ["owner", "admin"])
    .limit(1)
    .maybeSingle();
  return !!data;
}

/** True when the user is an active member (any role) of the org. */
export async function isOrgMember(
  admin: SupabaseClient,
  userId: string,
  orgId: string
): Promise<boolean> {
  const { data } = await admin
    .from("v2_memberships")
    .select("id")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .eq("status", "active")
    .is("archived_at", null)
    .maybeSingle();
  return !!data;
}

/** The org's URL slug (for building in-app deep-links). Use the service-role client. */
export async function orgSlug(admin: SupabaseClient, orgId: string): Promise<string | null> {
  const { data } = await admin
    .from("v2_organizations")
    .select("slug")
    .eq("id", orgId)
    .maybeSingle();
  return (data?.slug as string | undefined) ?? null;
}

/** The org's member-name display mode (defaults to 'nickname'). Service-role client. */
export async function orgNameMode(admin: SupabaseClient, orgId: string): Promise<NameMode> {
  const { data } = await admin
    .from("v2_organizations")
    .select("name_display")
    .eq("id", orgId)
    .maybeSingle();
  return data?.name_display === "real" ? "real" : "nickname";
}

/**
 * Normalize a user-entered custom domain to a bare lowercase hostname, or null
 * if it isn't a valid domain. Strips scheme/path/trailing dot.
 */
export function normalizeHostname(input: string): string | null {
  let h = input.trim().toLowerCase();
  h = h.replace(/^https?:\/\//, "");
  h = h.split("/")[0];
  h = h.replace(/\.$/, "");
  if (!/^(?=.{1,253}$)([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/.test(h)) return null;
  return h;
}

/** Map an image mime type to a file extension for storage keys. */
export function extForImage(mime: string): string | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
    default:
      return null;
  }
}
