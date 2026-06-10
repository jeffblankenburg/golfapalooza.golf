// Issue #138. Per-user text size preference. Stored as an enum string on
// users.font_scale; rendered to a CSS root-font-size percentage. Anything
// downstream sized in rem (Tailwind's defaults) scales automatically.

export type FontScale = "default" | "large" | "xlarge";

const PERCENTS: Record<FontScale, string> = {
  default: "100%",
  large: "115%",
  xlarge: "130%",
};

export function isFontScale(value: unknown): value is FontScale {
  return value === "default" || value === "large" || value === "xlarge";
}

export function fontScaleToPercent(scale: FontScale | null | undefined): string {
  if (!scale || !isFontScale(scale)) return PERCENTS.default;
  return PERCENTS[scale];
}
