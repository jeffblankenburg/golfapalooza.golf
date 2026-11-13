/**
 * "3s and Ds" — shared event definitions + reaction config (client- and
 * server-safe, pure). The 8 events and their unit values/direction come straight
 * from the house rules and are FIXED; only the per-event reaction (animation +
 * GIFs + sound) is editable by the admin.
 */

export type ThreesTeam = "a" | "b";
export type ThreesResult = "win" | "owe";

export type ThreesEventType =
  | "three_pointer"
  | "logo_three"
  | "three_point_play"
  | "dunk"
  | "four_point_play"
  | "half_court"
  | "buzzer_beater"
  | "airball_backcourt"
  | "airball_frontcourt"
  | "missed_dunk";

export interface ThreesEventDef {
  key: ThreesEventType;
  label: string;
  short: string;
  points: number; // positive multiplier (units of X)
  result: ThreesResult; // the executing team WINS (collects) or OWES
  /** Default board animation style for this event. */
  animation: ThreesAnimation;
}

export type ThreesAnimation = "slam" | "confetti" | "zoom" | "shake" | "groan";

/** The house ruleset. Order = the scorer console button order. */
export const THREES_EVENTS: ThreesEventDef[] = [
  { key: "three_pointer", label: "3-pointer", short: "3PT", points: 1, result: "win", animation: "zoom" },
  { key: "logo_three", label: "Logo 3", short: "LOGO 3", points: 2, result: "win", animation: "zoom" },
  { key: "three_point_play", label: "3-point play", short: "3PT PLAY", points: 1, result: "win", animation: "confetti" },
  { key: "dunk", label: "Dunk", short: "DUNK", points: 1, result: "win", animation: "slam" },
  { key: "four_point_play", label: "4-point play", short: "4PT PLAY", points: 2, result: "win", animation: "confetti" },
  { key: "half_court", label: "Half-court shot", short: "HALF COURT", points: 3, result: "win", animation: "confetti" },
  { key: "buzzer_beater", label: "Buzzer-beater", short: "BUZZER", points: 3, result: "win", animation: "confetti" },
  { key: "airball_backcourt", label: "Airball (backcourt 3)", short: "AIRBALL BC", points: 1, result: "owe", animation: "groan" },
  { key: "airball_frontcourt", label: "Airball (frontcourt 3)", short: "AIRBALL FC", points: 2, result: "owe", animation: "groan" },
  { key: "missed_dunk", label: "Missed dunk", short: "MISS DUNK", points: 2, result: "owe", animation: "shake" },
];

export const THREES_EVENT_BY_KEY: Record<string, ThreesEventDef> = Object.fromEntries(
  THREES_EVENTS.map((e) => [e.key, e]),
);

/** Per-event reaction the board plays. Seeded from defaults; admin-editable. */
export interface ThreesReaction {
  animation: ThreesAnimation;
  gifs: string[]; // Giphy URLs; one is picked at random per tap
  soundUrl: string | null; // a Soundboard clip URL or upload; null = the default cash register
}

/**
 * Reactions exist for each event, the "streak broken" moment, and the "And 1" —
 * a non-scoring pending state (a made basket + a foul) that the board holds up
 * until it resolves into a 3- or 4-point play (or is dismissed).
 */
export type ThreesReactionKey = ThreesEventType | "streak_break" | "and_one";
export type ThreesReactions = Partial<Record<ThreesReactionKey, ThreesReaction>>;

/** An And-1 is either a potential 3-point play (fouled on a 2) or a potential
 *  4-point play (fouled on a 3) — the scorer picks which so the board can show it. */
export type AndOnePotential = 3 | 4;

/**
 * The scoring play that resolves a pending And-1 from the scorer console: a made
 * free throw completes a 3-point play (potential 3) or a 4-point play (potential
 * 4). A miss scores nothing here, so the scorer just dismisses.
 */
export function andOneResolvers(potential: AndOnePotential): ThreesEventType[] {
  return potential === 4 ? ["four_point_play"] : ["three_point_play"];
}

/** Events that resolve a pending "And 1" (the made free throw completes the play). */
export const AND_ONE_RESOLVERS: ThreesEventType[] = ["three_point_play", "four_point_play"];

/** Default max-streak cap (admin-configurable per activity; null = no cap). */
export const STREAK_CAP = 5;

/**
 * How many times the cash register rings for an event: the length of the run
 * going INTO this event (i.e. the streak before it, capped) plus the event's own
 * point value. So a value-1 play rings its streak position (1, 2, 3…); a 4-point
 * play (value 2) as the 3rd in a run rings 2 (prior streak) + 2 (event) = 4.
 */
export function kachingCount(streakCount: number, points: number, cap: number | null): number {
  const prior = cap == null ? streakCount - 1 : Math.min(streakCount - 1, cap);
  return Math.max(0, prior) + points;
}

/** Label for a reaction key (events + the streak-break and And-1 moments). */
export function reactionKeyLabel(key: ThreesReactionKey): string {
  if (key === "streak_break") return "Streak broken";
  if (key === "and_one") return "And 1";
  return THREES_EVENT_BY_KEY[key]?.label || key;
}

/** The bundled default sound (public/) played when an event has no custom sound. */
export const DEFAULT_CASH_REGISTER = "/sounds/cash-register.mp3";

/** Fresh default reaction map (no GIFs, default sound, rule animation). */
export function defaultReactions(): ThreesReactions {
  const out: ThreesReactions = {};
  for (const e of THREES_EVENTS) {
    out[e.key] = { animation: e.animation, gifs: [], soundUrl: null };
  }
  out.streak_break = { animation: "shake", gifs: [], soundUrl: null };
  out.and_one = { animation: "zoom", gifs: [], soundUrl: null };
  return out;
}

export interface ThreesEventRow {
  id: string;
  team: ThreesTeam;
  event_type: ThreesEventType;
  points: number;
  result: ThreesResult;
  created_at: string;
}

/**
 * Which side an event gives momentum to: the executing team on a WIN, or the
 * OPPONENT on an OWE (an airball/missed dunk swings the run the other way).
 * Halftime team-switches make cumulative totals meaningless, so the board tracks
 * only this live run — never a running total.
 */
export function favoredSide(e: { team: ThreesTeam; result: ThreesResult }): ThreesTeam {
  const favorsA = (e.team === "a") === (e.result === "win");
  return favorsA ? "a" : "b";
}

export interface Streak {
  side: ThreesTeam | null;
  count: number; // raw consecutive events favoring `side`
  value: number; // display value, capped at STREAK_CAP
}

/**
 * The live run: consecutive most-recent events favoring the same side. `cap` is
 * the admin's max-streak setting — a positive integer, or null for no cap.
 */
export function currentStreak(events: ThreesEventRow[], cap: number | null = STREAK_CAP): Streak {
  let side: ThreesTeam | null = null;
  let count = 0;
  for (let i = events.length - 1; i >= 0; i--) {
    const s = favoredSide(events[i]);
    if (side === null) {
      side = s;
      count = 1;
    } else if (s === side) {
      count++;
    } else {
      break;
    }
  }
  return { side, count, value: cap == null ? count : Math.min(count, cap) };
}

/**
 * Did the MOST RECENT event break a run of >= 2 by the other side? Returns the
 * broken side + how long it was, so the board can celebrate the break.
 */
export function brokeStreak(events: ThreesEventRow[]): { broke: boolean; side: ThreesTeam | null; count: number } {
  if (events.length < 2) return { broke: false, side: null, count: 0 };
  const newSide = favoredSide(events[events.length - 1]);
  let side: ThreesTeam | null = null;
  let count = 0;
  for (let i = events.length - 2; i >= 0; i--) {
    const s = favoredSide(events[i]);
    if (side === null) {
      side = s;
      count = 1;
    } else if (s === side) {
      count++;
    } else {
      break;
    }
  }
  return { broke: side !== null && side !== newSide && count >= 2, side, count };
}
