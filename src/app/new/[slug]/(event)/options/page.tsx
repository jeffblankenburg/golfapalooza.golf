import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { OPTION_SELECT, loadOptionChoicePrices, tripCostCents, loadOptionSettings, selectionsStillOpen, type Option } from "@/lib/v2/options";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureActive, featureHasOpened } from "@/lib/v2/features";
import OptionsModule from "../OptionsModule";
import styles from "@/app/new/new.module.css";

/**
 * Member options page (#218) — the full list, reached from the "Everything" menu.
 * Editable while open; read-only once the deadline passes (is_open but expired).
 * Not reachable when options are closed (is_open=false) — the menu hides it then.
 */
export default async function MemberOptionsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data: ev } = await supabase
    .from("v2_events").select("id, name").eq("org_id", org.id).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (!ev) redirect(`/new/${slug}`);
  const eventId = ev.id as string;

  // Options scheduling lives in the Features availability window now.
  const isAdmin = org.role === "owner" || org.role === "admin";
  const resolved = await loadResolvedFeatures(supabase, org.id, eventId);
  const feat = resolved.find((r) => r.def.key === "options") || null;
  const nowDate = await v2Now();
  if (!feat || !featureHasOpened(feat, isAdmin, nowDate)) redirect(`/new/${slug}`); // not yet open / closed / off

  // Trip Cost is a normal selectable option (v1 parity) — include it; its price is
  // derived from the included_in_trip_cost catalog, not from bundled cost items.
  const [{ data: optRows }, { data: grpRows }, { data: selRows }] = await Promise.all([
    supabase.from("v2_options").select(OPTION_SELECT).eq("event_id", eventId).order("sort_order"),
    supabase.from("v2_option_groups").select("id, name, icon, sort_order").eq("event_id", eventId).order("sort_order"),
    supabase.from("v2_user_option_selections").select("option_id, value").eq("event_id", eventId).eq("user_id", ctx.userId),
  ]);
  const options = (optRows || []) as Option[];
  const [priceInfo, tc, optSettings] = await Promise.all([
    loadOptionChoicePrices(supabase, options.map((o) => o.id)),
    tripCostCents(supabase, eventId),
    loadOptionSettings(supabase, eventId),
  ]);
  // Editable only while the feature window is active AND the close cutoff hasn't passed.
  const open = isFeatureActive(feat, isAdmin, nowDate) && selectionsStillOpen(optSettings, nowDate.getTime());

  const memberOptions = options
    // A $0 Trip Cost (nothing marked for it yet) isn't worth showing as an option.
    .filter((o) => o.option_type !== "trip_cost" || tc > 0)
    .map((o) => {
      const isTrip = o.option_type === "trip_cost";
      return {
        id: o.id, name: o.name, description: o.description,
        option_type: (isTrip ? "checkbox" : o.option_type) as Option["option_type"],
        choices: o.choices, is_required: o.is_required, max_total: o.max_total, icon: o.icon, group_id: o.group_id,
        depends_on_option_id: o.depends_on_option_id, allow_none: o.allow_none, none_label: o.none_label,
        price_info: isTrip ? { whole: tc, byChoice: {} } : (priceInfo.get(o.id) || { whole: 0, byChoice: {} }),
      };
    });
  const selections: Record<string, unknown> = {};
  for (const s of (selRows as { option_id: string; value: unknown }[] | null) ?? []) selections[s.option_id] = s.value;
  const groups = ((grpRows as { id: string; name: string; icon: string | null }[] | null) ?? []).map((g) => ({ id: g.id, name: g.name, icon: g.icon }));

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <h1 className={styles.title}>Options</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        {open ? "Your add-ons for the event. Change them any time before the deadline." : "Selections are closed. Here's a summary of your choices."}
      </p>
      <OptionsModule
        eventId={eventId}
        options={memberOptions}
        groups={groups}
        initialSelections={selections}
        optionsOpen={open}
      />
    </div>
  );
}
