import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import MusicManager from "@/components/v2/music/MusicManager";
import styles from "@/app/new/new.module.css";

/**
 * Group-admin Music (jukebox) manager. Reachable by org owners/admins OR any
 * member granted the `manage_music` permission.
 */
export default async function AdminMusicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const isAdmin = org.role === "owner" || org.role === "admin";
  if (!isAdmin) {
    const admin = v2AdminClient();
    if (!(await hasPermission(admin, ctx.userId, org.id, "manage_music"))) {
      redirect(`/new/${slug}`);
    }
  }

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Administration
      </Link>
      <h1 className={styles.title} style={{ marginBottom: 16 }}>Music</h1>
      <MusicManager orgId={org.id} nameMode={org.name_display} />
    </div>
  );
}
