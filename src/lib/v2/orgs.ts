import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    .maybeSingle();
  return !!data && (data.role === "owner" || data.role === "admin");
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
    .maybeSingle();
  return !!data;
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
