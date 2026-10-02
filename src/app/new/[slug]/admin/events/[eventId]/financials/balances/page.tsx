import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";
import { loadEventBalances } from "@/lib/v2/balances";
import BalancesManager, { type BalanceRow } from "./BalancesManager";
import styles from "@/app/new/new.module.css";

/**
 * Admin per-member balances for an event (#214). Mirrors v1's FinancialGrid: a sortable
 * Member / Owed / Paid / Balance grid + totals, drill into a member to record payments,
 * credits, or manual charges. Owner/admin only.
 */
export default async function BalancesPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: event } = await admin.from("v2_events").select("id, name").eq("id", eventId).eq("org_id", org.id).maybeSingle();
  if (!event) redirect(`/new/${slug}/admin`);

  const [rows, mode] = await Promise.all([loadEventBalances(admin, eventId), orgNameMode(admin, org.id)]);
  const ids = rows.map((r) => r.userId);
  const { data: profs } = ids.length
    ? await admin.from("v2_profiles").select("id, display_name, first_name, last_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null }[] };
  const nameById = new Map((profs || []).map((p) => [p.id as string, pickName(p, mode)]));

  const balanceRows: BalanceRow[] = rows
    .map((r) => ({ ...r, name: nameById.get(r.userId) || "Member" }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}/financials`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Financials
      </Link>
      <h1 className={styles.title}>Balances</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        What each member owes (Trip Cost + their options) against what they&apos;ve paid. Tap a member to record a payment or charge.
      </p>

      <BalancesManager orgId={org.id} eventId={eventId} rows={balanceRows} />
    </div>
  );
}
