import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";
import {
  OPTION_SELECT, loadOptionChoicePrices, tripCostCents, type Option, type OptionPriceInfo,
} from "@/lib/v2/options";
import styles from "@/app/new/new.module.css";
import SelectionGrid, { type GridOption, type GridMember } from "./SelectionGrid";

/**
 * Options participant grid (#239, v1 parity) — every on-roster member (rows) ×
 * every option (columns). Admins can set a Loozer's selection inline; a footer
 * summarizes each column (per-choice counts / checked count / number total+avg)
 * plus the derived $ totals. Owner/admin. Thin server loader → client grid.
 */
export default async function OptionsGridPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: event } = await admin.from("v2_events").select("id, name").eq("id", eventId).eq("org_id", org.id).maybeSingle();
  if (!event) redirect(`/new/${slug}/admin/events`);

  const mode = await orgNameMode(admin, org.id);
  const [{ data: optRows }, { data: parts }, { data: sels }, tripCost] = await Promise.all([
    admin.from("v2_options").select(OPTION_SELECT).eq("event_id", eventId).order("sort_order"),
    admin.from("v2_event_participants").select("user_id, on_roster").eq("event_id", eventId),
    admin.from("v2_user_option_selections").select("user_id, option_id, value").eq("event_id", eventId),
    tripCostCents(admin, eventId),
  ]);
  const options = (optRows || []) as Option[];
  const priceInfo = await loadOptionChoicePrices(admin, options.map((o) => o.id));

  // selections: user → option → value
  const selByUser: Record<string, Record<string, unknown>> = {};
  for (const s of sels || []) {
    (selByUser[s.user_id as string] ||= {})[s.option_id as string] = s.value;
  }

  // Rows = on-roster members ∪ anyone who has a selection.
  const userIds = new Set<string>();
  for (const p of parts || []) if (p.on_roster) userIds.add(p.user_id as string);
  for (const uid of Object.keys(selByUser)) userIds.add(uid);

  const members: GridMember[] = [];
  if (userIds.size) {
    const { data: profs } = await admin
      .from("v2_profiles")
      .select("id, display_name, first_name, last_name, nickname")
      .in("id", [...userIds]);
    for (const p of profs || []) members.push({ userId: p.id as string, name: pickName(p, mode, "Member") });
  }
  members.sort((a, b) => a.name.localeCompare(b.name));

  const gridOptions: GridOption[] = options.map((o) => ({
    id: o.id,
    name: o.name,
    option_type: o.option_type,
    choices: (o.choices || []).map((c) => ({ value: c.value, label: c.label })),
    max_total: o.max_total ?? null,
    price: (priceInfo.get(o.id) || { whole: 0, byChoice: {} }) as OptionPriceInfo,
  }));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}/options`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Options
      </Link>
      <h1 className={styles.title}>Selections grid</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        Every member and what they picked, with the derived cost. Tap a cell to set a selection on their behalf. {event.name}.
      </p>

      <SelectionGrid
        orgId={org.id}
        eventId={eventId}
        options={gridOptions}
        members={members}
        tripCostCents={tripCost}
        initialSelections={selByUser}
      />
    </div>
  );
}
