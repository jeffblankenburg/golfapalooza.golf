/**
 * Issue #128 — data simulator generator types.
 *
 * `ModuleName` is the discriminator the populate/wipe routes accept.
 * Generators not yet implemented in Phase 1 still appear here so the API
 * surface is stable from day one.
 */

export const SIM_MODULES = [
  "roster",
  "scramble",
  "daily_contests",
  "hundred_feet",
  "pickem",
  "calcutta",
  "cornhole",
  "kgb_cup",
  "tee_times",
] as const;

export type ModuleName = (typeof SIM_MODULES)[number];

export interface GeneratorResult {
  module: ModuleName;
  inserted: number;
  skipped: number;
  warnings: string[];
}

export interface WipeResult {
  module: ModuleName;
  deleted: Record<string, number>;
}
