/**
 * v2 Options + money derivation (#216, epic #214).
 *
 * An Option is the member-facing, all-or-nothing opt-in. Its PRICE is derived from
 * the cost_items linked to it (`v2_cost_items.linked_option_id`) — never stored, so
 * editing a cost_item re-prices automatically. An Option bundles the CONTESTS whose
 * buy-in cost_items are linked to it; selecting it enrolls into all of them (#216
 * slice 2). Trip Cost is the one special derived option = SUM(included_in_trip_cost).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const OPTION_SELECT =
  "id, org_id, event_id, group_id, name, description, option_type, choices, is_required, max_total, icon, depends_on_option_id, allow_none, none_label, sort_order, created_at, updated_at";

export type OptionType = "checkbox" | "select" | "multi_select" | "quantity" | "text" | "number" | "trip_cost";

/** One choice on a select/multi_select/quantity option. `value` is a slug of `label`.
 *  Real price derives from linked cost_items; `cost` is only a display fallback. */
export interface OptionChoice {
  label: string;
  value: string;
  cost?: number | null;
  contest_id?: string | null;
}

export interface Option {
  id: string;
  org_id: string;
  event_id: string;
  group_id: string | null;
  name: string;
  description: string | null;
  option_type: OptionType;
  choices: OptionChoice[] | null;
  is_required: boolean;
  max_total: number | null;
  icon: string | null;
  depends_on_option_id: string | null;
  allow_none: boolean;        // offer an "I'm not having any" opt-out
  none_label: string | null;  // custom label for that opt-out
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/**
 * Ensure the one special, unremovable Trip Cost option exists for an event (#218).
 * Other options depend on it ("you can't opt in unless you're paying for the trip").
 * Its price is derived (SUM of included_in_trip_cost cost_items), not bundled. Service-role.
 */
export async function ensureTripCostOption(admin: SupabaseClient, orgId: string, eventId: string): Promise<Option> {
  // NOT maybeSingle: that returns null when >1 row matches, which would make this
  // insert a new Trip Cost every call once a duplicate exists (runaway). Take the
  // earliest existing one instead; a partial unique index (migration 00258) guards
  // against ever creating a second.
  const { data: existing } = await admin
    .from("v2_options").select(OPTION_SELECT)
    .eq("event_id", eventId).eq("option_type", "trip_cost")
    .order("created_at", { ascending: true }).limit(1);
  if (existing && existing.length) return existing[0] as Option;
  const { data, error } = await admin
    .from("v2_options")
    .insert({ org_id: orgId, event_id: eventId, name: "Trip Cost", option_type: "trip_cost", is_required: true, sort_order: -1 })
    .select(OPTION_SELECT).single();
  if (error) {
    // Lost a race to the unique index — fetch the winner instead of throwing.
    const { data: won } = await admin
      .from("v2_options").select(OPTION_SELECT)
      .eq("event_id", eventId).eq("option_type", "trip_cost")
      .order("created_at", { ascending: true }).limit(1);
    return (won?.[0] as Option);
  }
  return data as Option;
}

export const OPTION_GROUP_SELECT = "id, org_id, event_id, name, description, icon, sort_order, created_at, updated_at";

export interface OptionGroup {
  id: string;
  org_id: string;
  event_id: string;
  name: string;
  description: string | null;
  icon: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

/** The 7 option types + whether each takes choices / a cost. */
export const OPTION_TYPES: { type: OptionType; label: string; hasChoices: boolean; priced: boolean }[] = [
  { type: "checkbox", label: "Checkbox (yes/no)", hasChoices: false, priced: true },
  { type: "select", label: "Select one", hasChoices: true, priced: true },
  { type: "multi_select", label: "Select many", hasChoices: true, priced: true },
  { type: "quantity", label: "Quantity", hasChoices: true, priced: true },
  { type: "text", label: "Text", hasChoices: false, priced: false },
  { type: "number", label: "Number", hasChoices: false, priced: false },
  { type: "trip_cost", label: "Trip Cost (auto)", hasChoices: false, priced: true },
];

/** label → url-safe choice value (stable id stored in selections + cost links). */
export function slugifyChoice(label: string): string {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "choice";
}

const CHOICE_TYPES = new Set<OptionType>(["select", "multi_select", "quantity"]);
export const typeHasChoices = (t: OptionType) => CHOICE_TYPES.has(t);

/** Sanitize incoming choices for a type: null for non-choice types; else clean rows
 *  (drop blanks, slug the value from the label, keep optional cost/contest_id). */
export function normalizeChoices(raw: unknown, type: OptionType): OptionChoice[] | null {
  if (!CHOICE_TYPES.has(type)) return null;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: OptionChoice[] = [];
  for (const c of raw) {
    const r = (c || {}) as { label?: string; value?: string; cost?: number; contest_id?: string };
    const label = (r.label || "").trim();
    if (!label) continue;
    let value = (r.value || "").trim() || slugifyChoice(label);
    while (seen.has(value)) value = `${value}_2`;
    seen.add(value);
    out.push({ label, value, cost: typeof r.cost === "number" ? r.cost : null, contest_id: r.contest_id || null });
  }
  return out;
}

/** Derived price (cents) per option = SUM of the cost_items linked to it. */
export async function loadOptionPrices(admin: SupabaseClient, optionIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!optionIds.length) return out;
  const { data } = await admin
    .from("v2_cost_items")
    .select("linked_option_id, amount_cents")
    .in("linked_option_id", optionIds);
  for (const r of data || []) {
    const oid = r.linked_option_id as string | null;
    if (!oid) continue;
    out.set(oid, (out.get(oid) || 0) + ((r.amount_cents as number) || 0));
  }
  return out;
}

export interface OptionPriceInfo {
  whole: number; // cost_items with no choice link (applies whenever selected)
  byChoice: Record<string, number>; // per-choice-value cost
}

/** Per-option price breakdown: whole-option cost + per-choice costs (phase B). */
export async function loadOptionChoicePrices(admin: SupabaseClient, optionIds: string[]): Promise<Map<string, OptionPriceInfo>> {
  const out = new Map<string, OptionPriceInfo>();
  if (!optionIds.length) return out;
  for (const id of optionIds) out.set(id, { whole: 0, byChoice: {} });

  const { data: items } = await admin
    .from("v2_cost_items").select("id, amount_cents, linked_option_id").in("linked_option_id", optionIds);
  const costItems = items || [];
  const { data: links } = costItems.length
    ? await admin.from("v2_cost_item_option_choices").select("cost_item_id, choice_value").in("cost_item_id", costItems.map((i) => i.id as string))
    : { data: [] as { cost_item_id: string; choice_value: string }[] };
  const linksByItem = new Map<string, string[]>();
  for (const l of links || []) (linksByItem.get(l.cost_item_id as string) || linksByItem.set(l.cost_item_id as string, []).get(l.cost_item_id as string)!).push(l.choice_value as string);

  for (const it of costItems) {
    const oid = it.linked_option_id as string;
    const info = out.get(oid)!;
    const amt = (it.amount_cents as number) || 0;
    const choiceVals = linksByItem.get(it.id as string);
    if (!choiceVals || choiceVals.length === 0) info.whole += amt;
    else for (const cv of choiceVals) info.byChoice[cv] = (info.byChoice[cv] || 0) + amt;
  }
  return out;
}

/** The cents a given selection value costs, using an option's price breakdown. */
export function priceForValue(type: OptionType, value: unknown, info: OptionPriceInfo): number {
  if (optionValueIsEmpty(type, value)) return 0;
  if (type === "quantity" && value && typeof value === "object") {
    const q = value as Record<string, number>;
    return info.whole + Object.entries(q).reduce((s, [cv, n]) => s + (info.byChoice[cv] || 0) * Number(n || 0), 0);
  }
  const chosen = selectedChoiceValues(type, value);
  if (chosen.size === 0) return info.whole; // checkbox
  return info.whole + [...chosen].reduce((s, cv) => s + (info.byChoice[cv] || 0), 0);
}

/** Trip Cost (cents) for an event = SUM of cost_items marked included_in_trip_cost. */
export async function tripCostCents(admin: SupabaseClient, eventId: string): Promise<number> {
  const { data } = await admin
    .from("v2_cost_items")
    .select("amount_cents")
    .eq("event_id", eventId)
    .eq("included_in_trip_cost", true);
  return (data || []).reduce((s, r) => s + ((r.amount_cents as number) || 0), 0);
}

/**
 * When a member deselects an option, clear every option that DEPENDS on it (and their
 * dependents, recursively) — removing those selections + their contest enrollment.
 * Mirrors v1's dependency cascade (#218 phase C).
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

export interface OptionSettings {
  selection_deadline: string | null;  // read-only cutoff (visible-but-frozen); null = no cutoff
}

/**
 * Per-event option settings. Whether Options is visible, when it opens, and the
 * "it's open" notification now live in the Features registry (#218); this table
 * only carries the Options-specific read-only cutoff (members can still SEE the
 * page after it, but can no longer change picks).
 */
export async function loadOptionSettings(admin: SupabaseClient, eventId: string): Promise<OptionSettings> {
  const { data } = await admin
    .from("v2_event_option_settings")
    .select("selection_deadline")
    .eq("event_id", eventId).maybeSingle();
  return {
    selection_deadline: (data?.selection_deadline as string | null) ?? null,
  };
}

/** Members may still CHANGE selections — i.e. the read-only cutoff hasn't passed. */
export function selectionsStillOpen(s: OptionSettings, nowMs: number): boolean {
  if (s.selection_deadline && new Date(s.selection_deadline).getTime() < nowMs) return false;
  return true;
}

/** The contest ids an option bundles (its linked cost_items' source contests/side games). */
export async function optionContestIds(admin: SupabaseClient, optionId: string): Promise<string[]> {
  const { data } = await admin
    .from("v2_cost_items")
    .select("source_id")
    .eq("linked_option_id", optionId)
    .in("source_type", ["contest", "side_game"]);
  return [...new Set((data || []).map((r) => r.source_id as string | null).filter((x): x is string => !!x))];
}

/** True when a selection value means "nothing selected" for its type. */
export function optionValueIsEmpty(type: OptionType, v: unknown): boolean {
  switch (type) {
    case "checkbox": return v !== true;
    case "select": return !(typeof v === "string" && v.length > 0);
    case "multi_select": return !(Array.isArray(v) && v.length > 0);
    // A non-null object is an ANSWER — including {} ("I'm not having any"), which is a
    // valid answered-none state for a required quantity option (v1 parity). Only
    // null/undefined is unanswered.
    case "quantity": return !(v !== null && v !== undefined && typeof v === "object" && !Array.isArray(v));
    case "text": return !(typeof v === "string" && v.trim().length > 0);
    case "number": return v === null || v === undefined || v === "";
    default: return true;
  }
}

/**
 * Whether a selection is "active" for REVEALING dependent options — stricter than
 * "answered": a quantity option opted to "none" ({}) is answered but not active, so it
 * doesn't reveal its dependents (v1 keys dependency off a positive total).
 */
export function selectionIsActive(type: OptionType, v: unknown): boolean {
  if (type === "quantity") {
    return !!v && typeof v === "object" && !Array.isArray(v) && Object.values(v as Record<string, number>).some((n) => Number(n) > 0);
  }
  return !optionValueIsEmpty(type, v);
}

/** The choice values a selection activates (empty for non-choice types). */
export function selectedChoiceValues(type: OptionType, v: unknown): Set<string> {
  if (type === "select" && typeof v === "string") return new Set([v]);
  if (type === "multi_select" && Array.isArray(v)) return new Set(v as string[]);
  if (type === "quantity" && v && typeof v === "object") {
    return new Set(Object.entries(v as Record<string, number>).filter(([, n]) => Number(n) > 0).map(([k]) => k));
  }
  return new Set();
}

/**
 * Enroll a member into the contests their option SELECTION funds (#218 phase B). A
 * contest's funding cost_item applies when it has no choice link (whole-option) OR a
 * choice link matching the member's selection. Non-applicable option contests are
 * removed. An empty value removes the member from every contest the option bundles.
 * Idempotent. Options are the only enrollment path for opt-in contests, so removal is safe.
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
  }
}
