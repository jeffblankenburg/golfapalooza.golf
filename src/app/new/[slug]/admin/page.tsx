import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import styles from "@/app/new/new.module.css";
import AdminGrid from "@/app/new/_components/AdminGrid";
import EventsSection from "../EventsSection";

export default async function AdminHub({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new"); // not a member → back to your own landing
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {org.name}
      </Link>
      <h1 className={styles.title}>Administration</h1>

      <EventsSection orgId={org.id} slug={org.slug} isAdmin />

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Group administration</p>
        <AdminGrid
          items={[
            { label: "Members", href: `/new/${slug}/admin/members`, desc: "Roster, roles & invites" },
            { label: "Settings", href: `/new/${slug}/admin/settings`, desc: "Name, logo, colors, domains" },
            { label: "Courses", desc: "Course library" },
            { label: "People", desc: "Bios & profiles" },
            { label: "Music", desc: "Jukebox library" },
            { label: "Articles", desc: "News & posts" },
            { label: "Announcements", desc: "Notify members" },
            { label: "Gallery", desc: "Photos & videos" },
            { label: "Chat", desc: "Rooms" },
            { label: "Records", desc: "Accolades & history" },
          ]}
        />
      </div>
    </div>
  );
}
