import { SupabaseClient } from "@supabase/supabase-js";

interface OptionChoice {
  label: string;
  value: string;
  cost?: number;
  contest_id?: string;
}

/**
 * Sync contest_participants based on a user's option selection.
 *
 * For checkbox options with linked_contest_id:
 *   - value === true → upsert into contest_participants
 *   - value === false/null → remove from contest_participants
 *
 * For multi_select options where individual choices have contest_id:
 *   - For each choice with contest_id: if selected → upsert, if not → remove
 *
 * For select options with linked_contest_id:
 *   - If any non-empty value selected → upsert
 *   - If value is null/cleared → remove
 *
 * @param adminClient - Supabase admin client (bypasses RLS)
 * @param userId - The user whose enrollment to sync
 * @param option - The trip_options row
 * @param value - The selection value (true/false, string, string[], or null)
 */
export async function syncContestEnrollment(
  adminClient: SupabaseClient,
  userId: string,
  option: {
    id: string;
    option_type: string;
    linked_contest_id?: string | null;
    choices?: OptionChoice[] | null;
  },
  value: unknown
): Promise<void> {
  if (option.option_type === "checkbox") {
    // Checkbox with a linked contest
    if (!option.linked_contest_id) return;

    if (value === true) {
      await adminClient
        .from("contest_participants")
        .upsert(
          { contest_id: option.linked_contest_id, user_id: userId },
          { onConflict: "contest_id,user_id" }
        );
    } else {
      await adminClient
        .from("contest_participants")
        .delete()
        .eq("contest_id", option.linked_contest_id)
        .eq("user_id", userId);
    }
  } else if (option.option_type === "select") {
    // Select with a linked contest — any non-empty selection = enrolled
    if (!option.linked_contest_id) return;

    if (value && value !== "none" && value !== "") {
      await adminClient
        .from("contest_participants")
        .upsert(
          { contest_id: option.linked_contest_id, user_id: userId },
          { onConflict: "contest_id,user_id" }
        );
    } else {
      await adminClient
        .from("contest_participants")
        .delete()
        .eq("contest_id", option.linked_contest_id)
        .eq("user_id", userId);
    }
  } else if (option.option_type === "multi_select") {
    // Multi-select: check each choice for contest_id
    const choices = (option.choices || []) as OptionChoice[];
    const selectedValues = Array.isArray(value) ? (value as string[]) : [];

    // Also handle top-level linked_contest_id (enrolled if ANY choice is selected)
    if (option.linked_contest_id) {
      if (selectedValues.length > 0) {
        await adminClient
          .from("contest_participants")
          .upsert(
            { contest_id: option.linked_contest_id, user_id: userId },
            { onConflict: "contest_id,user_id" }
          );
      } else {
        await adminClient
          .from("contest_participants")
          .delete()
          .eq("contest_id", option.linked_contest_id)
          .eq("user_id", userId);
      }
    }

    // Per-choice contest linking
    for (const choice of choices) {
      if (!choice.contest_id) continue;

      if (selectedValues.includes(choice.value)) {
        await adminClient
          .from("contest_participants")
          .upsert(
            { contest_id: choice.contest_id, user_id: userId },
            { onConflict: "contest_id,user_id" }
          );
      } else {
        await adminClient
          .from("contest_participants")
          .delete()
          .eq("contest_id", choice.contest_id)
          .eq("user_id", userId);
      }
    }
  }
  // text and number types: no contest linking
}

/**
 * Sync `contest_participants` based on cost_item linkages — issue #124.
 *
 * Today's `syncContestEnrollment` (above) wires options → contests directly
 * via `trip_options.linked_contest_id` / `choices[].contest_id`. The newer
 * model wires options → cost_items → contests, where:
 *   - `cost_items.linked_option_id` says which option funds the cost item
 *   - `cost_item_option_choices(choice_value)` filters to specific choices
 *     (empty rows = funded by any non-zero selection on the option)
 *   - `contests.buy_in_cost_item_id` says which cost_item bankrolls the contest
 *
 * When a user changes their selection on `optionId`, this resolves every
 * cost_item that fundable from that option, decides whether the user's value
 * funds it, and upserts/deletes contest_participants for every contest whose
 * buy-in cost_item matches.
 *
 * Idempotent. Can run alongside `syncContestEnrollment` — they upsert the
 * same composite key with no conflicts.
 */
export async function syncCostItemContestEnrollment(
  adminClient: SupabaseClient,
  userId: string,
  optionId: string,
  value: unknown,
): Promise<void> {
  const { data: items } = await adminClient
    .from("cost_items")
    .select("id, choices:cost_item_option_choices(choice_value)")
    .eq("linked_option_id", optionId);
  if (!items || items.length === 0) return;

  for (const item of items as Array<{ id: string; choices?: { choice_value: string }[] | null }>) {
    const choices = item.choices || [];
    const fundsThis = (() => {
      if (choices.length === 0) return isYesValue(value);
      const choiceSet = new Set(choices.map((c) => c.choice_value));
      if (Array.isArray(value)) return (value as unknown[]).some((v) => typeof v === "string" && choiceSet.has(v));
      if (typeof value === "string") return choiceSet.has(value);
      // checkbox `true` against a choice-filtered cost_item is a config bug —
      // we treat it as funded so admins notice rather than silently skip.
      return value === true;
    })();

    const { data: contests } = await adminClient
      .from("contests")
      .select("id")
      .eq("buy_in_cost_item_id", item.id);
    if (!contests || contests.length === 0) continue;

    for (const c of contests as Array<{ id: string }>) {
      if (fundsThis) {
        await adminClient
          .from("contest_participants")
          .upsert(
            { contest_id: c.id, user_id: userId },
            { onConflict: "contest_id,user_id" },
          );
      } else {
        await adminClient
          .from("contest_participants")
          .delete()
          .eq("contest_id", c.id)
          .eq("user_id", userId);
      }
    }
  }
}

function isYesValue(value: unknown): boolean {
  if (value === true) return true;
  if (typeof value === "string") return value !== "" && value !== "none";
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return value > 0;
  return false;
}
