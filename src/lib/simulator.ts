import { cookies } from "next/headers";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const SIM_USER_COOKIE = "sim-user-id";

// Wrapped in React's request-scoped cache so the home-page's many callers
// (≥5 on the active page) share a single Supabase round-trip per request.
export const getSimDate = cache(async (): Promise<string | null> => {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trip_settings")
    .select("sim_date")
    .eq("status", "active")
    .single();
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
