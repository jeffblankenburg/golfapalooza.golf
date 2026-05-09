// Shared category metadata used by both the cost-items admin page and any
// place that lists cost items (e.g. the OptionBuilder link modal). Keeps
// labels and ordering consistent everywhere.

export const CATEGORY_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: "lodging", label: "Lodging" },
  { value: "food", label: "Food & Beverage" },
  { value: "operational", label: "Operational" },
  { value: "event_pot", label: "Event Pot (payout)" },
  { value: "option_entry", label: "Option Entry" },
  { value: "pass_through", label: "Pass-through" },
  { value: "other", label: "Other" },
];

export const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  CATEGORY_OPTIONS.map((o) => [o.value, o.label]),
);

export const UNCATEGORIZED_KEY = "__uncategorized__";
export const UNCATEGORIZED_LABEL = "Uncategorized";

// Sort comparator: items sorted by their category's position in
// CATEGORY_OPTIONS, then by sort_order within the category, then by name.
export function compareCostItems(
  a: { category: string | null; sort_order: number; name: string },
  b: { category: string | null; sort_order: number; name: string },
): number {
  const order = new Map(CATEGORY_OPTIONS.map((o, i) => [o.value, i]));
  const ai = a.category && order.has(a.category) ? order.get(a.category)! : 999;
  const bi = b.category && order.has(b.category) ? order.get(b.category)! : 999;
  if (ai !== bi) return ai - bi;
  if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
  return a.name.localeCompare(b.name);
}

// Group items by category preserving CATEGORY_OPTIONS order; items with
// unknown / null categories land in an "uncategorized" bucket at the end.
export function groupByCategory<T extends { category: string | null }>(
  items: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const o of CATEGORY_OPTIONS) groups.set(o.value, []);
  groups.set(UNCATEGORIZED_KEY, []);
  for (const item of items) {
    const cat = item.category && groups.has(item.category) ? item.category : UNCATEGORIZED_KEY;
    groups.get(cat)!.push(item);
  }
  return groups;
}
