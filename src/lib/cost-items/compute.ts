// Compute trip_options costs from linked cost_items.
//
// This is the spine of the cost_items single-source-of-truth model (#125).
// Every API route that returns option data wraps the rows through this helper
// so consumers see a derived `cost` (and per-choice `cost`) instead of the
// stored value. Stored values stay in the schema as a fallback for options
// that haven't been linked yet, but should be considered legacy.
//
// Cost rules:
//   - option_type='trip_cost':
//       option.cost = SUM(cost_items.cost) WHERE trip_id matches AND
//                    included_in_trip_cost=true. Explicit linkages are
//                    ignored. Adding a new trip-cost-flagged item flows
//                    in automatically — admin doesn't re-link each time.
//   - Option has NO linked cost_items                → keep stored cost (fallback).
//   - Option has linked items + option_type='checkbox':
//       option.cost = SUM(linked items with no choice junction rows).
//   - Option has linked items + option_type='select' / 'multi_select':
//       For each existing choice in option.choices:
//         If any linked item has a junction row matching choice.value:
//           choice.cost = SUM(those items' costs)
//         Else:
//           choice.cost stays as stored (lets unlinked choices coexist).
//
// One bulk query fetches every cost_item linked to any of the input options
// (with their junction rows joined) — O(1) round trips per call regardless of
// how many options are passed in. The auto-trip-cost path adds a second
// bulk query (one per distinct trip_id in the input).

import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Client = SupabaseClient<any, "public", any>;

export interface OptionChoice {
  label?: string;
  value: string;
  cost?: number | null;
}

export interface OptionLike {
  id: string;
  option_type?: string;
  cost?: number | null;
  choices?: OptionChoice[] | null;
  trip_id?: string;
  // Other fields are passed through unchanged.
  [k: string]: unknown;
}

interface LinkedCostItem {
  id: string;
  cost: number;
  linked_option_id: string;
  choices: Array<{ choice_value: string }>;
}

export async function computeOptionCosts<T extends OptionLike>(
  client: Client,
  options: T[],
): Promise<T[]> {
  if (!options || options.length === 0) return options;

  const optionIds = options.map((o) => o.id).filter(Boolean);
  if (optionIds.length === 0) return options;

  const { data, error } = await client
    .from("cost_items")
    .select(
      "id, cost, linked_option_id, choices:cost_item_option_choices(choice_value)",
    )
    .in("linked_option_id", optionIds);

  if (error) {
    // Don't break the API on a compute failure — fall through to stored values.
    console.error("[computeOptionCosts] failed to fetch linked items:", error.message);
    return options;
  }

  const items = (data || []) as unknown as LinkedCostItem[];
  const itemsByOption = new Map<string, LinkedCostItem[]>();
  for (const item of items) {
    if (!item.linked_option_id) continue;
    if (!itemsByOption.has(item.linked_option_id)) {
      itemsByOption.set(item.linked_option_id, []);
    }
    itemsByOption.get(item.linked_option_id)!.push(item);
  }

  // option_type='trip_cost' path: SUM(cost_items.cost) WHERE
  // included_in_trip_cost=true, scoped per trip_id. Bulk-fetch one sum per
  // distinct trip_id present in the input.
  const tripCostTripIds = new Set<string>();
  for (const opt of options) {
    if (opt.option_type === "trip_cost" && opt.trip_id) {
      tripCostTripIds.add(opt.trip_id);
    }
  }
  const tripCostByTripId = new Map<string, number>();
  if (tripCostTripIds.size > 0) {
    const { data: tripCostRows } = await client
      .from("cost_items")
      .select("trip_id, cost")
      .in("trip_id", Array.from(tripCostTripIds))
      .eq("included_in_trip_cost", true);
    for (const row of tripCostRows || []) {
      const tid = row.trip_id as string;
      tripCostByTripId.set(tid, (tripCostByTripId.get(tid) || 0) + Number(row.cost || 0));
    }
  }

  return options.map((opt) => {
    if (opt.option_type === "trip_cost" && opt.trip_id) {
      const computed = tripCostByTripId.get(opt.trip_id) || 0;
      return { ...opt, cost: round2(computed) };
    }

    const linked = itemsByOption.get(opt.id);
    if (!linked || linked.length === 0) return opt;

    if (opt.option_type === "checkbox") {
      // Flat-cost items: those with no choice junction rows.
      const flatItems = linked.filter((i) => i.choices.length === 0);
      if (flatItems.length === 0) return opt;
      const computed = flatItems.reduce((s, i) => s + Number(i.cost), 0);
      return { ...opt, cost: round2(computed) };
    }

    if (Array.isArray(opt.choices) && opt.choices.length > 0) {
      const newChoices = opt.choices.map((ch) => {
        const matching = linked.filter((i) =>
          i.choices.some((c) => c.choice_value === ch.value),
        );
        if (matching.length === 0) return ch; // no link for this choice → keep stored
        const computed = matching.reduce((s, i) => s + Number(i.cost), 0);
        return { ...ch, cost: round2(computed) };
      });
      return { ...opt, choices: newChoices };
    }

    return opt;
  });
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
