import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

const SIM_USER_COOKIE = "sim-user-id";

export async function getSimDate(): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("trip_settings")
    .select("sim_date")
    .eq("status", "active")
    .single();
  return data?.sim_date || null;
}

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

export async function getSimUserId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(SIM_USER_COOKIE)?.value || null;
}

export async function getEffectiveUserId(realUserId: string): Promise<string> {
  const simUserId = await getSimUserId();
  return simUserId || realUserId;
}

export async function isSimulating(): Promise<boolean> {
  const cookieStore = await cookies();
  return !!cookieStore.get(SIM_USER_COOKIE)?.value;
}
