import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { COST_ITEM_SELECT, COST_CATEGORY_LABEL } from "@/lib/v2/cost-items";
import { loadCostCategories } from "@/lib/v2/cost-categories";
import FinancialsManager, { type CostItem } from "./FinancialsManager";
import styles from "@/app/new/new.module.css";

/**
 * Event financials (#213). The reviewable, editable catalog of every cost item,
 * reconciled to the Trip Cost or (later) an option. Owner/admin only; the
 * breakdown is never shown to regular members.
 */
export default async function FinancialsPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const [{ data: event }, { data: items }, { data: contestRows }, categories] = await Promise.all([
    admin.from("v2_events").select("id, name").eq("id", eventId).eq("org_id", org.id).maybeSingle(),
    admin.from("v2_cost_items").select(COST_ITEM_SELECT).eq("event_id", eventId).order("sort_order").order("created_at"),
    admin.from("v2_contests").select("id, name, parent_contest_id").eq("event_id", eventId),
    loadCostCategories(admin),
  ]);
  if (!event) redirect(`/new/${slug}/admin`);

  const catLabel = new Map(categories.map((c) => [c.key, c.label]));

  // Group contest-sourced items under their top-level contest (a side game lands
  // with its parent scramble); everything else groups by its category.
  const cmap = new Map((contestRows || []).map((c) => [c.id as string, { name: c.name as string, parent: (c.parent_contest_id as string) ?? null }]));
  type CostRow = Omit<CostItem, "group_key" | "group_label">;
  const withGroups: CostItem[] = (((items as CostRow[]) || [])).map((it) => {
    if (it.source_type === "contest" || it.source_type === "side_game") {
      const rec = it.source_id ? cmap.get(it.source_id) : null;
      const topId = it.source_type === "side_game" && rec?.parent ? rec.parent : it.source_id;
      const top = topId ? cmap.get(topId) : null;
      return { ...it, group_key: `contest:${topId}`, group_label: top?.name || "Contest" };
    }
    const cat = it.category || "other";
    return { ...it, group_key: `cat:${cat}`, group_label: catLabel.get(cat) || COST_CATEGORY_LABEL[cat] || cat };
  });

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {event.name}
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Financials</h1>
        <Link href={`/new/${slug}/admin/events/${eventId}/financials/balances`} className={styles.createBtnGhost}>Balances</Link>
      </div>

      <FinancialsManager
        slug={slug}
        orgId={org.id}
        eventId={eventId}
        initialItems={withGroups}
        categories={categories.map((c) => ({ key: c.key, label: c.label, icon: c.icon }))}
      />
    </div>
  );
}
