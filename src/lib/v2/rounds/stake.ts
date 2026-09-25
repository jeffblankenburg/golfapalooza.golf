/**
 * Stake input formatting (#183). Number inputs strip trailing zeros ("0.10" → "0.1"),
 * so stake fields use a text input backed by these helpers: whole dollars show plain
 * ("5"), fractional stakes show two decimals ("0.10", "0.25").
 */
export const formatStake = (n: number | null): string =>
  n == null ? "" : Number.isInteger(n) ? String(n) : n.toFixed(2);

export const parseStake = (s: string): number | null => {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.max(0, n) : null;
};
