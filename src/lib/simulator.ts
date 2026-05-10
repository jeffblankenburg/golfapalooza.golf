import { cookies } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const SIM_USER_COOKIE = "sim-user-id";
const SIM_TRIP_COOKIE = "sim-trip-id";

// Per-admin sim-trip cookie (issue #126). When set, every server-side
// `getEffectiveTripId()` call returns this trip id instead of the
// `status='active'` row. Loozers never have this cookie set.
export const getSimTripId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return cookieStore.get(SIM_TRIP_COOKIE)?.value || null;
});

// Effective active trip — falls back to the real active trip when sim
// mode is off. This is the canonical "what trip am I operating against"
// resolver; every server-side lookup of the active trip should use it.
export const getEffectiveTripId = cache(async (): Promise<string | null> => {
  const simTripId = await getSimTripId();
  if (simTripId) return simTripId;

  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .maybeSingle();
  return data?.id ?? null;
});

// Wrapped in React's request-scoped cache so the home-page's many callers
// (≥5 on the active page) share a single Supabase round-trip per request.
// Reads sim_date from the *effective* trip so sim-mode admins get the test
// event's clock instead of the real trip's.
export const getSimDate = cache(async (): Promise<string | null> => {
  const tripId = await getEffectiveTripId();
  if (!tripId) return null;
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trip_settings")
    .select("sim_date")
    .eq("id", tripId)
    .maybeSingle();
  return data?.sim_date || null;
});

export async function getEffectiveDate(): Promise<Date> {
  const simDate = await getSimDate();
  if (simDate) {
    // Supports "2026-09-03" (midnight) or "2026-09-03T14:30" (with time)
    if (simDate.includes("T")) {
      const [datePart, timePart] = simDate.split("T");
      const [y, m, d] = datePart.split("-").map(Number);
      const [h, min] = timePart.split(":").map(Number);
      return new Date(y, m - 1, d, h, min);
    }
    const [y, m, d] = simDate.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  return new Date();
}

export const getSimUserId = cache(async (): Promise<string | null> => {
  const cookieStore = await cookies();
  return cookieStore.get(SIM_USER_COOKIE)?.value || null;
});

export async function getEffectiveUserId(realUserId: string): Promise<string> {
  const simUserId = await getSimUserId();
  return simUserId || realUserId;
}

export async function isSimulating(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!cookieStore.get(SIM_USER_COOKIE)?.value;
}

// True when admin has the sim-trip cookie set, i.e. they're viewing the
// app as if the test event were the active event. Use for sim-mode
// banners and to short-circuit notification / chat / activity-log writes.
export async function isSimulatingTrip(): Promise<boolean> {
  return !!(await getSimTripId());
}
