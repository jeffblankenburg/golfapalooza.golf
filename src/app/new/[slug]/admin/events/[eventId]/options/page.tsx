import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { OPTION_SELECT, OPTION_GROUP_SELECT, loadOptionPrices, tripCostCents, loadOptionSettings, ensureTripCostOption, type Option, type OptionGroup } from "@/lib/v2/options";
import { loadCostCategories } from "@/lib/v2/cost-categories";
import OptionsManager, { type OptionData, type OptItem } from "./OptionsManager";
import styles from "@/app/new/new.module.css";

/**
 * Event Options (#216) — the opt-in add-ons members choose. Each option's price is
 * DERIVED from the cost_items bundled into it. Admins build options here and bundle
 * contests/costs; members select them (member-facing selection lands next). Owner/admin.
 */
export default async function EventOptionsPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: event } = await admin.from("v2_events").select("id, name").eq("id", eventId).eq("org_id", org.id).maybeSingle();
  if (!event) redirect(`/new/${slug}/admin/events`);

  // The unremovable Trip Cost option exists for every event; create it on first visit.
  // (It's then loaded with the rest below and rendered as a draggable option.)
  await ensureTripCostOption(admin, org.id, eventId);

  const [{ data: optRows }, { data: groupRows }, tripCost, settings] = await Promise.all([
    // Trip Cost is now included — it's a draggable, placeable option like the rest.
    admin.from("v2_options").select(OPTION_SELECT).eq("event_id", eventId).order("sort_order"),
    admin.from("v2_option_groups").select(OPTION_GROUP_SELECT).eq("event_id", eventId).order("sort_order"),
    tripCostCents(admin, eventId),
    loadOptionSettings(admin, eventId),
  ]);
  const options = (optRows || []) as Option[];
  const groups = (groupRows || []) as OptionGroup[];
  const ids = options.map((o) => o.id);
  const prices = await loadOptionPrices(admin, ids);

  // Every cost_item for the event, split into bundled-by-option vs available
  // (unreconciled: not in Trip Cost, not yet in an option). Each carries its group
  // (parent contest, or category) + sort_order so the picker mirrors the Financials
  // screen's familiar grouped, ordered layout.
  const [{ data: items }, { data: contestRows }, categories] = await Promise.all([
    admin
      .from("v2_cost_items")
      .select("id, name, amount_cents, category, source_type, source_id, linked_option_id, included_in_trip_cost, sort_order")
      .eq("event_id", eventId).order("sort_order").order("created_at"),
    admin.from("v2_contests").select("id, name, parent_contest_id").eq("event_id", eventId),
    loadCostCategories(admin),
  ]);
  const cmap = new Map((contestRows || []).map((c) => [c.id as string, { name: c.name as string, parent: (c.parent_contest_id as string) ?? null }]));
  const catLabel = new Map(categories.map((c) => [c.key, c.label]));
  const resolveGroup = (it: { source_type: string; source_id: string | null; category: string | null }): { group_key: string; group_label: string } => {
    if (it.source_type === "contest" || it.source_type === "side_game") {
      const rec = it.source_id ? cmap.get(it.source_id) : null;
      const topId = it.source_type === "side_game" && rec?.parent ? rec.parent : it.source_id;
      const top = topId ? cmap.get(topId) : null;
      return { group_key: `contest:${topId}`, group_label: top?.name || "Contest" };
    }
    const cat = it.category || "other";
    return { group_key: `cat:${cat}`, group_label: catLabel.get(cat) || cat };
  };

  // Per-choice funding links: which choice value(s) each bundled cost_item funds.
  // A single cost item can fund MANY choices (e.g. a Monday hotel night applies to
  // every "arrive Monday" choice) — the junction is many-to-many.
  const itemIds = (items || []).map((i) => i.id as string);
  const { data: juncRows } = itemIds.length
    ? await admin.from("v2_cost_item_option_choices").select("cost_item_id, choice_value").in("cost_item_id", itemIds)
    : { data: [] as { cost_item_id: string; choice_value: string }[] };
  const choicesByItem = new Map<string, string[]>();
  for (const j of juncRows || []) (choicesByItem.get(j.cost_item_id as string) || choicesByItem.set(j.cost_item_id as string, []).get(j.cost_item_id as string)!).push(j.choice_value as string);

  const bundledByOption = new Map<string, OptItem[]>();
  const available: OptItem[] = [];
  for (const it of items || []) {
    const g = resolveGroup(it as { source_type: string; source_id: string | null; category: string | null });
    const item: OptItem = {
      id: it.id as string, name: it.name as string, amount_cents: (it.amount_cents as number) || 0,
      source_type: it.source_type as string, group_key: g.group_key, group_label: g.group_label, sort_order: (it.sort_order as number) ?? 0,
      choice_values: choicesByItem.get(it.id as string) ?? [],
    };
    if (it.linked_option_id) (bundledByOption.get(it.linked_option_id as string) || bundledByOption.set(it.linked_option_id as string, []).get(it.linked_option_id as string)!).push(item);
    else if (!it.included_in_trip_cost) available.push(item);
  }

  const initialOptions: OptionData[] = options.map((o) => ({
    id: o.id, name: o.name, description: o.description, group_id: o.group_id,
    option_type: o.option_type, choices: o.choices, is_required: o.is_required,
    max_total: o.max_total, icon: o.icon, depends_on_option_id: o.depends_on_option_id,
    allow_none: o.allow_none, none_label: o.none_label,
    // Trip Cost's price is derived (sum of everything in Trip Cost), not from bundled items.
    price_cents: o.option_type === "trip_cost" ? tripCost : (prices.get(o.id) || 0),
    items: bundledByOption.get(o.id) || [],
  }));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {event.name}
      </Link>
      <h1 className={styles.title}>Options</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        Opt-in add-ons members choose, all-or-nothing. An option&apos;s price is the sum of the costs bundled into it. Anything not in Trip Cost belongs in an option.
      </p>

      <OptionsManager
        slug={slug}
        orgId={org.id}
        eventId={eventId}
        initialOptions={initialOptions}
        initialAvailable={available}
        initialGroups={groups.map((g) => ({ id: g.id, name: g.name, description: g.description, icon: g.icon }))}
        initialSettings={settings}
      />
    </div>
  );
}
