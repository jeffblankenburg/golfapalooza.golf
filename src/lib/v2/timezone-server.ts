import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_TIMEZONE, isValidTimeZone } from "./timezone";

/**
 * The IANA timezone an org's times should be displayed in:
 *   1. the event's own zone, when a time belongs to an event (pass it in), else
 *   2. the org's home zone (v2_organizations.timezone), for group-scoped screens, else
 *   3. the platform default.
 * Keeping this resolution in one place means every display site picks the same zone,
 * and events can still override their org's home zone per-event.
 */
export async function resolveOrgTimeZone(
  supabase: SupabaseClient,
  orgId: string,
  eventTimeZone?: string | null,
): Promise<string> {
  if (isValidTimeZone(eventTimeZone)) return eventTimeZone as string;
  const { data } = await supabase.from("v2_organizations").select("timezone").eq("id", orgId).maybeSingle();
  const home = (data as { timezone: string | null } | null)?.timezone;
  return isValidTimeZone(home) ? (home as string) : DEFAULT_TIMEZONE;
}
