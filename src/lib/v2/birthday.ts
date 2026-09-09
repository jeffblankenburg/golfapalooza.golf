// Birthday helpers for v2. Local copy so v2 shares no legacy code.
// Sayings are age-agnostic; {age} is replaced with the Loozer's integer age.

export const BIRTHDAY_SUBTITLES: string[] = [
  "Turning {age} today!",
  "{age} years young.",
  "{age} candles on the cake.",
  "Another year in the bag.",
  "{age} and still a Loozer.",
  "{age} trips around the sun.",
  "Officially {age}.",
  "Level {age} unlocked.",
  "{age} and counting.",
  "{age} today. Still swinging.",
  "{age}. Par for the course.",
  "{age} years of bad swings.",
  "{age}. Bring cake.",
  "{age} candles, zero birdies.",
  "Fairway to {age}.",
  "Age {age}. Handicap: debatable.",
  "{age} today. Still slicing it.",
  "Year {age}. Let's go.",
  "{age} and still blaming the clubs.",
  "Cake time. {age} candles.",
  "{age} years on planet earth.",
  "{age}. Still in the group chat.",
  "{age} today. Party at 5.",
  "Another year, another 18.",
  "{age}. Statistically still mortal.",
  "{age} and refusing to act it.",
  "{age}. Mulligans not included.",
  "{age} today. Roast accordingly.",
  "{age}. Still us.",
  "{age} and still airmailing the board.",
  "{age}. Bags in. Drinks in. Let's go.",
  "{age}. Cornhole champion in their mind.",
  "Pour the Fireball. {age} candles.",
  "{age}. Fireball is not a food group.",
  "{age} today. Fireball is calling.",
  "{age} candles, {age} Fireball shots.",
];

/** Random age-based saying. Call client-side to avoid SSR hydration mismatch. */
export function pickBirthdaySubtitle(age: number): string {
  const t = BIRTHDAY_SUBTITLES[Math.floor(Math.random() * BIRTHDAY_SUBTITLES.length)];
  return t.replace(/\{age\}/g, String(age));
}

/** Today's calendar date in a given timezone (defaults to the golf group's ET). */
export function todayInTimezone(tz = "America/New_York"): {
  month: number;
  day: number;
  year: number;
} {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => parseInt(parts.find((p) => p.type === t)!.value, 10);
  return { month: get("month"), day: get("day"), year: get("year") };
}

/** Age turning today, given a YYYY-MM-DD birthdate and today's year. */
export function ageTurningToday(birthdate: string, todayYear: number): number {
  const birthYear = parseInt(birthdate.slice(0, 4), 10);
  return Math.max(0, todayYear - birthYear);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface PersonWithBirthdate {
  id: string;
  name: string;
  avatarUrl: string | null;
  birthdate: string; // YYYY-MM-DD
}

export interface UpcomingBirthday {
  id: string;
  name: string;
  avatarUrl: string | null;
  month: number; // 1-12
  day: number;
  dateLabel: string; // e.g. "Sep 9"
  monthKey: string; // e.g. "2026-09" (for grouping, chronological)
  monthLabel: string; // e.g. "September 2026"
  ageTurning: number;
  daysAway: number;
  isToday: boolean;
}

/**
 * Every person's NEXT birthday within the coming 12 months, sorted soonest-first
 * (today's birthdays included, at the top). Age is the age they'll turn on that
 * upcoming birthday. Leap-day birthdays are labeled Feb 29 but sorted by the
 * platform's date rollover.
 */
export function upcomingBirthdays(
  people: PersonWithBirthdate[],
  today = todayInTimezone(),
): UpcomingBirthday[] {
  const todayMs = Date.UTC(today.year, today.month - 1, today.day);
  const abbr = (m: number) => MONTHS[m - 1].slice(0, 3);

  return people
    .filter((p) => /^\d{4}-\d{2}-\d{2}$/.test(p.birthdate))
    .map((p) => {
      const birthYear = parseInt(p.birthdate.slice(0, 4), 10);
      const month = parseInt(p.birthdate.slice(5, 7), 10);
      const day = parseInt(p.birthdate.slice(8, 10), 10);

      // Next occurrence: this year if not yet passed, else next year.
      let occYear = today.year;
      if (Date.UTC(occYear, month - 1, day) < todayMs) occYear += 1;
      const occMs = Date.UTC(occYear, month - 1, day);
      const daysAway = Math.round((occMs - todayMs) / 86_400_000);

      return {
        id: p.id,
        name: p.name,
        avatarUrl: p.avatarUrl,
        month,
        day,
        dateLabel: `${abbr(month)} ${day}`,
        monthKey: `${occYear}-${String(month).padStart(2, "0")}`,
        monthLabel: `${MONTHS[month - 1]} ${occYear}`,
        ageTurning: Math.max(0, occYear - birthYear),
        daysAway,
        isToday: daysAway === 0,
      };
    })
    .sort((a, b) => a.daysAway - b.daysAway || a.name.localeCompare(b.name));
}
