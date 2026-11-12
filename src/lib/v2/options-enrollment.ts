import type { SupabaseClient } from "@supabase/supabase-js";
import { releaseContestAssets } from "./contests/enrollment";
import { optionValueIsEmpty, selectedChoiceValues, type OptionType } from "./options";

/**
 * Server-only: reconcile a member's option selection with the contest(s) that option funds
 * (via cost_items). Lives apart from `options.ts` on purpose — it reaches into enrollment →
 * notifications → web-push (Node-only), which must never be pulled into a client bundle.
 * `options.ts` stays client-safe (pure helpers like `priceForValue` are imported by client
 * components); anything that enrolls/releases contest assets belongs here.
 *
 * For an option that links to a contest/side game: the matching selection enrolls the member
 * (per choice link), a non-applicable or empty selection removes them and hands back whatever
 * they held in that contest. Idempotent. Options are the only enrollment path for opt-in
 * contests, so removal is safe.
 */
export async function syncOptionContestEnrollment(
  admin: SupabaseClient,
  optionId: string,
  userId: string,
  value: unknown,
): Promise<void> {
  const { data: opt } = await admin.from("v2_options").select("option_type").eq("id", optionId).maybeSingle();
  const type = (opt?.option_type as OptionType) || "checkbox";

  // All cost_items funding this option that point at a contest/side game.
  const { data: items } = await admin
    .from("v2_cost_items").select("id, source_id, source_type").eq("linked_option_id", optionId).in("source_type", ["contest", "side_game"]);
  const costItems = (items || []).filter((i) => i.source_id);
  if (costItems.length === 0) return;

  const allContestIds = [...new Set(costItems.map((i) => i.source_id as string))];
  const empty = optionValueIsEmpty(type, value);
  if (empty) {
    await admin.from("v2_contest_participants").delete().eq("user_id", userId).in("contest_id", allContestIds);
    // Deselecting the option leaves the contest entirely — hand back whatever they held in it.
    for (const cid of allContestIds) await releaseContestAssets(admin, cid, [userId]);
    return;
  }

  // Which cost_items apply to this selection (no choice link, or a matching one)?
  const { data: links } = await admin
    .from("v2_cost_item_option_choices").select("cost_item_id, choice_value").in("cost_item_id", costItems.map((i) => i.id as string));
  const choiceLinks = new Map<string, string[]>();
  for (const l of links || []) (choiceLinks.get(l.cost_item_id as string) || choiceLinks.set(l.cost_item_id as string, []).get(l.cost_item_id as string)!).push(l.choice_value as string);

  const chosen = selectedChoiceValues(type, value);
  const applies = (itemId: string) => {
    const cv = choiceLinks.get(itemId);
    return !cv || cv.length === 0 || cv.some((v) => chosen.has(v));
  };
  const enrollIds = [...new Set(costItems.filter((i) => applies(i.id as string)).map((i) => i.source_id as string))];
  const removeIds = allContestIds.filter((id) => !enrollIds.includes(id));

  if (enrollIds.length) {
    await admin.from("v2_contest_participants").upsert(enrollIds.map((contest_id) => ({ contest_id, user_id: userId })), { onConflict: "contest_id,user_id", ignoreDuplicates: true });
  }
  if (removeIds.length) {
    await admin.from("v2_contest_participants").delete().eq("user_id", userId).in("contest_id", removeIds);
    // Changing the selection dropped these contests — release what they held in each.
    for (const cid of removeIds) await releaseContestAssets(admin, cid, [userId]);
  }
}

/**
 * When a member deselects an option, clear every option that DEPENDS on it (and their
 * dependents, recursively) — removing those selections + their contest enrollment. Lives
 * here (not `options.ts`) because it drives `syncOptionContestEnrollment`, which is
 * server-only. Mirrors v1's dependency cascade (#218 phase C).
 */
export async function cascadeDeselectDependents(admin: SupabaseClient, eventId: string, userId: string, parentOptionId: string): Promise<void> {
  const queue = [parentOptionId];
  const guard = new Set<string>();
  while (queue.length) {
    const pid = queue.shift()!;
    if (guard.has(pid)) continue;
    guard.add(pid);
    const { data: deps } = await admin.from("v2_options").select("id").eq("event_id", eventId).eq("depends_on_option_id", pid);
    for (const d of deps || []) {
      const did = d.id as string;
      const { data: removed } = await admin.from("v2_user_option_selections").delete().eq("option_id", did).eq("user_id", userId).select("option_id");
      if (removed && removed.length) {
        await syncOptionContestEnrollment(admin, did, userId, null);
        queue.push(did);
      }
    }
  }
}
