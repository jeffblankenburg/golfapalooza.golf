// Tee gender is a native attribute of a tee box (migration 00226). Men's and
// unisex ("all") tees are the standard set; women's/forward tees are a separate
// rated set. These helpers give one consistent display order + labelling for
// tees everywhere they surface (course editor, round wizard, round detail).

export type TeeGender = "men" | "women" | "all";

export interface SortableTee {
  gender?: string | null;
  course_rating?: number | null;
}

/** Women's tees sort after men's/unisex; everything else groups together. */
export function genderRank(gender?: string | null): number {
  return gender === "women" ? 1 : 0;
}

/**
 * Canonical tee order: men's + unisex first, women's after, and within each
 * group longest (highest course rating) first. Nulls sort last within a group.
 */
export function compareTees(a: SortableTee, b: SortableTee): number {
  const g = genderRank(a.gender) - genderRank(b.gender);
  if (g !== 0) return g;
  const ar = a.course_rating ?? -Infinity;
  const br = b.course_rating ?? -Infinity;
  return br - ar;
}

export function sortTees<T extends SortableTee>(tees: T[]): T[] {
  return [...tees].sort(compareTees);
}

/** Short badge text for a tee's gender, or null when there's nothing to flag. */
export function genderBadge(gender?: string | null): string | null {
  if (gender === "women") return "Women's";
  if (gender === "men") return "Men's";
  return null; // 'all' / unisex needs no badge
}

export const isWomensTee = (gender?: string | null): boolean => gender === "women";
