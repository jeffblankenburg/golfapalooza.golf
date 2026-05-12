/**
 * Smart visibility: auto time-gating with admin overrides.
 *
 * Each feature has an auto rule based on the trip timeline.
 * Admin can force any feature visible via visibility_overrides.
 */

export type VisibilityFeature =
  | "scoring"
  | "tee_times"
  | "scorecards"
  | "skins"
  | "hundred_feet"
  | "daily_games"
  | "rooms"
  | "teams";

interface TripVisibilityContext {
  start_date: string;
  visibility_overrides: Record<string, boolean>;
}

/**
 * Check if a feature is visible, combining auto time rules with admin overrides.
 *
 * @param feature - The feature key
 * @param trip - Trip with start_date and visibility_overrides
 * @param now - Current date (supports simulator)
 * @param options - Extra context (e.g., player's tee time for scoring gates)
 */
export function isFeatureVisible(
  feature: VisibilityFeature,
  trip: TripVisibilityContext,
  now: Date,
  options?: {
    /** Player's tee time as "HH:MM" for scoring gates */
    playerTeeTime?: string | null;
    /** The day_number of the tee time */
    teeTimeDayNumber?: number | null;
  }
): boolean {
  // Admin override always wins. Explicit true = force visible, explicit
  // false = force hidden. Anything else (undefined / missing) falls
  // through to the auto rules below.
  const override = trip.visibility_overrides?.[feature];
  if (override === true) return true;
  if (override === false) return false;

  const [y, m, d] = trip.start_date.split("-").map(Number);
  const tripStart = new Date(y, m - 1, d);

  // Days until/since trip start
  const nowDateOnly = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffDays = Math.floor((nowDateOnly.getTime() - tripStart.getTime()) / (1000 * 60 * 60 * 24));
  const todayDayNumber = diffDays + 1;

  switch (feature) {
    case "scoring": {
      // Show 1 hour before the player's tee time on their tee time day
      if (!options?.playerTeeTime || options.teeTimeDayNumber == null) return false;
      if (todayDayNumber !== options.teeTimeDayNumber) return false;
      const [h, min] = options.playerTeeTime.split(":").map(Number);
      const teeMinutes = h * 60 + min;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      return nowMinutes >= teeMinutes - 60;
    }

    case "tee_times":
      // Show from 1 day before trip start
      return diffDays >= -1;

    case "scorecards":
    case "hundred_feet":
    case "teams":
      // Show from trip start date onward
      return diffDays >= 0;

    case "daily_games":
    case "skins":
      // Always visible — empty tiles + pot previews are useful before
      // scoring begins.
      return true;

    case "rooms":
      // Show from 1 week before trip start
      return diffDays >= -7;

    default:
      return true;
  }
}

/** All features with their display metadata */
export const VISIBILITY_FEATURES: {
  key: VisibilityFeature;
  label: string;
  autoDescription: string;
}[] = [
  { key: "scoring", label: "Live Scoring", autoDescription: "1 hour before tee time" },
  { key: "tee_times", label: "Tee Times", autoDescription: "1 day before trip" },
  { key: "scorecards", label: "Scorecards", autoDescription: "Trip start date" },
  { key: "skins", label: "Skins", autoDescription: "Always visible" },
  { key: "hundred_feet", label: "100 Feet", autoDescription: "Trip start date" },
  { key: "daily_games", label: "Daily Games", autoDescription: "Always visible" },
  { key: "rooms", label: "Room Assignments", autoDescription: "1 week before trip" },
  { key: "teams", label: "Team Compositions", autoDescription: "Trip start date" },
];
