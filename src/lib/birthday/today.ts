import type { SupabaseClient } from "@supabase/supabase-js";

export interface BirthdayToday {
  id: string;
  display_name: string;
  avatar_url: string | null;
  age: number;
}

function partsInTimezone(tz: string): { month: number; day: number; year: number } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const year = parseInt(parts.find((p) => p.type === "year")!.value, 10);
  const month = parseInt(parts.find((p) => p.type === "month")!.value, 10);
  const day = parseInt(parts.find((p) => p.type === "day")!.value, 10);
  return { month, day, year };
}

export async function getBirthdaysToday(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  adminClient: SupabaseClient<any, "public", any>,
  timezone: string,
): Promise<BirthdayToday[]> {
  const { month, day, year } = partsInTimezone(timezone);

  const { data: users } = await adminClient
    .from("users")
    .select("id, display_name, avatar_url, birthday")
    .not("birthday", "is", null);

  return (users || [])
    .filter((u: { birthday: string | null }) => {
      if (!u.birthday) return false;
      const [, m, d] = u.birthday.split("-").map(Number);
      return m === month && d === day;
    })
    .map((u: { id: string; display_name: string; avatar_url: string | null; birthday: string }) => {
      const [by, bm, bd] = u.birthday.split("-").map(Number);
      // If birthday year is after "today's year in tz" (bad data), age falls back to 0.
      let age = year - by;
      // Defensive: if somehow current m/d is before birth m/d (shouldn't happen
      // because we filter to same m/d), decrement.
      if (month < bm || (month === bm && day < bd)) age--;
      return {
        id: u.id,
        display_name: u.display_name,
        avatar_url: u.avatar_url,
        age: Math.max(0, age),
      };
    });
}

export function currentYearInTimezone(timezone: string): number {
  return partsInTimezone(timezone).year;
}
