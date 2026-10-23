import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";
import { loadOrgBalances } from "@/lib/v2/finance/org-balances";
import OrgBalances, { type OrgBalanceDisplayRow } from "./OrgBalances";
import styles from "@/app/new/new.module.css";

/**
 * Group-wide financial rollup (#237). The admin's single board of every member's net
 * money across all events + group contests. Read-only — payments are recorded per
 * event (Balances) or per contest (its collector page); this view only nets & shows.
 * Owner/admin only.
 */
export default async function GroupFinancialsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const [rows, mode] = await Promise.all([loadOrgBalances(admin, org.id), orgNameMode(admin, org.id)]);

  const ids = rows.map((r) => r.userId);
  const { data: profs } = ids.length
    ? await admin.from("v2_profiles").select("id, display_name, first_name, last_name").in("id", ids)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null }[] };
  const nameById = new Map((profs || []).map((p) => [p.id as string, pickName(p, mode)]));

  // Biggest outstanding balances first (the admin's "who still owes" board), then name.
  const displayRows: OrgBalanceDisplayRow[] = rows
    .map((r) => ({ ...r, name: nameById.get(r.userId) || "Member" }))
    .sort((a, b) => b.balanceCents - a.balanceCents || a.name.localeCompare(b.name));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Administration
      </Link>
      <h1 className={styles.title}>Financials</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        Every member&apos;s money across all events and group contests. Tap a member to see what makes up their balance. Record payments on an event&apos;s Balances page or a contest&apos;s page.
      </p>

      <OrgBalances rows={displayRows} />
    </div>
  );
}
