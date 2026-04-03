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
