// Short subtitle phrases for the home-page birthday banner.
// Kept age-agnostic so the same pool works for any age from 20s to 90s.
// {age} is replaced with the Loozer's integer age.
// These are intentionally shorter than BIRTHDAY_MESSAGES (which power the
// chat auto-post) — the banner already says "Happy birthday, {name}!" above,
// so the subtitle is the age-focused follow-through.

export const BIRTHDAY_BANNER_SUBTITLES: string[] = [
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

export function pickBannerSubtitle(age: number): string {
  const template =
    BIRTHDAY_BANNER_SUBTITLES[
      Math.floor(Math.random() * BIRTHDAY_BANNER_SUBTITLES.length)
    ];
  return template.replace(/\{age\}/g, String(age));
}
