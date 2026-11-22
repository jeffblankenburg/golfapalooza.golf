import type { SupabaseClient } from "@supabase/supabase-js";
import { displayNameFrom } from "./profile";
import { geocodeAddress } from "./geocode";

/**
 * Canonical sanitize + write for a v2 profile's editable data fields. Shared by the
 * member's own PATCH (/api/v2/profile) AND the admin member editor
 * (/api/v2/orgs/[id]/members), so both honor the exact same rules and can't drift.
 * Avatar + phone are handled separately (upload / OTP / auth-admin).
 */

const SWINGS = ["right", "left", "both"];
const SHOTS = ["straight", "slice", "hook", "draw", "fade"];
const SHIRTS = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"];

const str = (v: unknown): string | null => {
  const t = typeof v === "string" ? v.trim() : "";
  return t || null;
};
// Payment handles stored bare — strip a leading @ or a full venmo/paypal URL.
const handle = (v: unknown): string | null => {
  const s = str(v);
  return s ? s.replace(/^@/, "").replace(/^https?:\/\/(www\.)?(venmo\.com|paypal\.me)\//i, "").replace(/\/$/, "") || null : null;
};

/** Build a v2_profiles patch from a raw body — only the keys present, sanitized. */
export function buildProfilePatch(body: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if ("first_name" in body) p.first_name = str(body.first_name);
  if ("last_name" in body) p.last_name = str(body.last_name);
  if ("nickname" in body) p.nickname = str(body.nickname);
  if ("birthdate" in body) {
    const b = str(body.birthdate);
    p.birthdate = b && /^\d{4}-\d{2}-\d{2}$/.test(b) ? b : null;
  }
  if ("zip" in body) p.zip = str(body.zip);
  if ("occupation" in body) p.occupation = str(body.occupation);
  if ("city" in body) p.city = str(body.city);
  if ("state" in body) {
    const s = str(body.state);
    p.state = s ? s.toUpperCase().slice(0, 2) : null;
  }
  if ("playing_since" in body) {
    const n = Number(body.playing_since);
    p.playing_since = Number.isInteger(n) && n >= 1900 && n <= new Date().getFullYear() ? n : null;
  }
  if ("swings" in body) {
    const s = str(body.swings);
    p.swings = s && SWINGS.includes(s) ? s : null;
  }
  if ("typical_shot" in body) {
    const s = str(body.typical_shot);
    p.typical_shot = s && SHOTS.includes(s) ? s : null;
  }
  if ("shirt_size" in body) {
    const s = str(body.shirt_size);
    const u = s ? s.toUpperCase() : null;
    p.shirt_size = u && SHIRTS.includes(u) ? u : null;
  }
  if ("fun_fact" in body) p.fun_fact = str(body.fun_fact);
  if ("best_shot" in body) p.best_shot = str(body.best_shot);
  if ("venmo_username" in body) p.venmo_username = handle(body.venmo_username);
  if ("paypal_username" in body) p.paypal_username = handle(body.paypal_username);
  if ("address" in body) p.address = str(body.address);
  if ("map_visibility" in body) {
    const m = str(body.map_visibility);
    p.map_visibility = m && ["address", "city", "state", "off"].includes(m) ? m : "off";
  }
  if ("allergies" in body) p.allergies = str(body.allergies);
  if ("tracked_stats" in body) {
    const allowed = ["putts", "fairways", "gir", "penalties"];
    const arr = Array.isArray(body.tracked_stats) ? body.tracked_stats : [];
    p.tracked_stats = [...new Set(arr.filter((s): s is string => typeof s === "string" && allowed.includes(s)))];
  }
  return p;
}

export interface ProfileUpdateResult { status: number; error?: string; data?: unknown; }

/** Apply a sanitized profile patch for `userId`, recomputing display_name on a name
 *  change. Real name can't be cleared (it's the display fallback). */
export async function applyProfileUpdate(
  admin: SupabaseClient,
  userId: string,
  body: Record<string, unknown>,
  selectColumns?: string,
): Promise<ProfileUpdateResult> {
  const patch = buildProfilePatch(body);
  if (("first_name" in patch && !patch.first_name) || ("last_name" in patch && !patch.last_name)) {
    return { status: 400, error: "First and last name are required" };
  }
  if (Object.keys(patch).length === 0) return { status: 400, error: "Nothing to update" };

  if ("first_name" in patch || "last_name" in patch || "nickname" in patch) {
    const { data: cur } = await admin
      .from("v2_profiles")
      .select("first_name, last_name, nickname, display_name")
      .eq("id", userId)
      .maybeSingle();
    patch.display_name = displayNameFrom(
      {
        first_name: ("first_name" in patch ? patch.first_name : cur?.first_name) as string | null,
        last_name: ("last_name" in patch ? patch.last_name : cur?.last_name) as string | null,
        nickname: ("nickname" in patch ? patch.nickname : cur?.nickname) as string | null,
      },
      (cur?.display_name as string) || "Member",
    );
  }
  // Keep the member's map point in sync with their address. Re-geocode only when an
  // address field actually changed; clear the point if the address can't be resolved
  // (e.g. they cleared it) so the map never shows a stale location.
  if ("address" in patch || "city" in patch || "state" in patch) {
    const { data: cur } = await admin
      .from("v2_profiles")
      .select("address, city, state")
      .eq("id", userId)
      .maybeSingle();
    const coords = await geocodeAddress({
      address: ("address" in patch ? patch.address : cur?.address) as string | null,
      city: ("city" in patch ? patch.city : cur?.city) as string | null,
      state: ("state" in patch ? patch.state : cur?.state) as string | null,
    });
    patch.latitude = coords ? coords[0] : null;
    patch.longitude = coords ? coords[1] : null;
  }

  patch.updated_at = new Date().toISOString();

  if (selectColumns) {
    const { data, error } = await admin.from("v2_profiles").update(patch).eq("id", userId).select(selectColumns).maybeSingle();
    return error ? { status: 500, error: error.message } : { status: 200, data };
  }
  const { error } = await admin.from("v2_profiles").update(patch).eq("id", userId);
  return error ? { status: 500, error: error.message } : { status: 200 };
}
