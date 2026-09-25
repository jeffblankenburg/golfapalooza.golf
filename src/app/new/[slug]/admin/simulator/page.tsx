import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { getSimUserCookie, getSimAt } from "@/lib/v2/simulator";
import { pickName } from "@/lib/v2/profile";
import SimulatorPanel from "./SimulatorPanel";
import styles from "@/app/new/new.module.css";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

/**
 * Admin simulator page (dev/admin). View the app as another member and/or override
 * "now". Owner/admin only. Note: while simulating a non-admin member you lose admin
 * access (you're seeing the app as them) — exit via the app-wide banner to return.
 */
export default async function AdminSimulatorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data } = await admin
    .from("v2_memberships")
    .select("user_id, member:v2_profiles(display_name, first_name, last_name, nickname, avatar_url)")
    .eq("org_id", org.id)
    .eq("status", "active")
    .is("archived_at", null);

  const members = (data || [])
    .map((m) => {
      const p = one(m.member);
      return {
        userId: m.user_id as string,
        name: pickName(p, org.name_display),
        avatarUrl: (p?.avatar_url as string | null) ?? null,
        search: [p?.display_name, p?.first_name, p?.last_name, p?.nickname].filter(Boolean).join(" ").toLowerCase(),
      };
    })
    .filter((m) => m.userId !== ctx.realUserId) // can't simulate yourself
    .sort((a, b) => a.name.localeCompare(b.name));

  const currentSimUserId = await getSimUserCookie();
  const currentSimAt = await getSimAt();

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Administration
      </Link>
      <h1 className={styles.title} style={{ marginBottom: 16 }}>Simulator</h1>
      <SimulatorPanel slug={slug} members={members} currentSimUserId={currentSimUserId} currentSimAt={currentSimAt} />
    </div>
  );
}
