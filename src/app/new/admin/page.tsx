import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { pickName } from "@/lib/v2/profile";
import styles from "@/app/new/new.module.css";
import AdminGrid from "@/app/new/_components/AdminGrid";
import PlatformAdmin, { type OrgRow, type Candidate } from "./PlatformAdmin";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Platform system-admin console (GH #178). Cross-org "all groups" view plus system
 * admin management. Gated to platform system admins — everyone else bounces to their
 * own landing. Reads via the service-role client because org RLS only exposes groups
 * the viewer belongs to.
 */
export default async function PlatformAdminPage() {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  if (!ctx.isSystemAdmin) redirect("/new");

  const admin = v2AdminClient();

  const [{ data: overview }, { data: owners }, { data: profiles }] = await Promise.all([
    admin
      .from("v2_org_overview")
      .select("id, name, slug, logo_url, created_at, creator_name, member_count, event_count, active_event_name")
      .order("created_at", { ascending: false }),
    // Pick one owner per org to offer "view as owner". role='owner', active only.
    admin
      .from("v2_memberships")
      .select("org_id, user_id, member:v2_profiles(display_name, first_name, last_name, nickname)")
      .eq("role", "owner")
      .eq("status", "active")
      .is("archived_at", null),
    // Candidate pool for granting the system-admin flag + the current roster.
    // NOTE: small today; if the profile table ever exceeds 1000 rows, paginate here.
    admin
      .from("v2_profiles")
      .select("id, display_name, first_name, last_name, nickname, avatar_url, is_system_admin")
      .order("display_name", { ascending: true }),
  ]);

  const ownerByOrg = new Map<string, { userId: string; name: string }>();
  for (const o of owners || []) {
    if (ownerByOrg.has(o.org_id)) continue; // first owner wins
    const p = one(o.member);
    ownerByOrg.set(o.org_id, { userId: o.user_id as string, name: pickName(p, "real") });
  }

  const orgs: OrgRow[] = (overview || []).map((o) => {
    const owner = ownerByOrg.get(o.id as string) || null;
    return {
      id: o.id as string,
      name: o.name as string,
      slug: o.slug as string,
      logoUrl: (o.logo_url as string | null) ?? null,
      createdLabel: fmtDate(o.created_at as string | null),
      creatorName: (o.creator_name as string | null) ?? null,
      memberCount: Number(o.member_count ?? 0),
      eventCount: Number(o.event_count ?? 0),
      activeEventName: (o.active_event_name as string | null) ?? null,
      ownerUserId: owner?.userId ?? null,
      ownerName: owner?.name ?? null,
    };
  });

  const candidates: Candidate[] = (profiles || []).map((p) => ({
    userId: p.id as string,
    name: pickName(p, "real"),
    avatarUrl: (p.avatar_url as string | null) ?? null,
    isSystemAdmin: !!p.is_system_admin,
    search: [p.display_name, p.first_name, p.last_name, p.nickname].filter(Boolean).join(" ").toLowerCase(),
  }));

  return (
    <div className={styles.page}>
      <Link href="/new" className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Your groups
      </Link>
      <h1 className={styles.title}>Platform</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        Every group on the platform, and who can administer it. System admins see and manage all groups.
      </p>

      <div className={styles.rule} />

      <PlatformAdmin orgs={orgs} candidates={candidates} currentUserId={ctx.realUserId} />

      <div className={styles.section} style={{ marginTop: 28 }}>
        <p className={styles.sectionLabel}>Data management</p>
        <AdminGrid
          items={[
            { label: "Cost categories", href: "/new/admin/cost-categories", desc: "Shared categories for cost items" },
            { label: "Scoring metrics", href: "/new/admin/scoring-metrics", desc: "Per-player observations contests can collect" },
          ]}
        />
      </div>
    </div>
  );
}
