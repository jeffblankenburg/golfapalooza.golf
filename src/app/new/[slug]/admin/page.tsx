import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import styles from "@/app/new/new.module.css";
import AdminGrid from "@/app/new/_components/AdminGrid";
import FeatureVisibilityControl from "@/app/new/_components/FeatureVisibilityControl";
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

  // Member-visibility toggle rendered inline on each group feature card (group scope,
  // event_id null). Lights up only for available, group-scoped, non-always-on features.
  const supabase = await v2ServerClient();
  const resolved = await loadResolvedFeatures(supabase, org.id, null);
  const byKey = new Map(resolved.map((f) => [f.def.key, f]));
  const control = (key: string) => {
    const f = byKey.get(key);
    if (!f || f.def.status !== "available" || f.def.scope !== "group" || f.def.alwaysOn) return undefined;
    return (
      <FeatureVisibilityControl
        orgId={org.id}
        featureKey={key}
        topbar={f.def.topbar}
        timeZone={org.timezone}
        config={{
          visibility: f.visibility,
          pinned: f.pinned,
          public: f.public,
          label: f.label,
          navOrder: f.navOrder,
          availability: f.availability,
          availableFrom: f.availableFrom,
          availableUntil: f.availableUntil,
          openNotificationTitle: f.openNotificationTitle,
          openNotificationBody: f.openNotificationBody,
        }}
      />
    );
  };

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {org.name}
      </Link>
      <h1 className={styles.title}>Administration</h1>

      <EventsSection orgId={org.id} slug={org.slug} isAdmin nameMode={org.name_display} />

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Group administration</p>
        <AdminGrid
          items={[
            { label: "Members", href: `/new/${slug}/admin/members`, desc: "Roster, roles & invites", control: control("loozers") },
            { label: "Schedule", href: `/new/${slug}/admin/schedule`, desc: "Group calendar (non-event dates)" },
            { label: "Features", href: `/new/${slug}/admin/features`, desc: "Turn group-wide features on & off" },
            { label: "Contests", href: `/new/${slug}/admin/contests`, desc: "Group pools (Squares, pick'em…)" },
            { label: "Tournaments", href: `/new/${slug}/admin/tournaments`, desc: "Brackets (March Madness, playoffs)" },
            { label: "Financials", href: `/new/${slug}/admin/financials`, desc: "Who owes what, across everything" },
            { label: "Settings", href: `/new/${slug}/admin/settings`, desc: "Name, logo, colors, domains" },
            { label: "Courses", href: `/new/${slug}/courses`, desc: "Course library", control: control("courses") },
            { label: "People", desc: "Bios & profiles" },
            { label: "Music", href: `/new/${slug}/admin/music`, desc: "Jukebox library", control: control("music") },
            { label: "Articles", href: `/new/${slug}/admin/articles`, desc: "News & posts", control: control("articles") },
            { label: "Announcements", href: `/new/${slug}/admin/announcements`, desc: "Notify members", control: control("announcements") },
            { label: "Gallery", desc: "Photos & videos", control: control("photos") },
            { label: "Chat", desc: "Rooms", control: control("chat") },
            { label: "Records", desc: "Accolades & history" },
            { label: "My Rounds", desc: "Personal round tracking", control: control("my_rounds") },
            { label: "My Money", desc: "Personal balances & payments", control: control("my_money") },
            { label: "Birthdays", desc: "Birthday feed & banners", control: control("birthdays") },
            { label: "Soundboard", desc: "Shared sound clips", control: control("soundboard") },
          ]}
        />
      </div>

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Developer</p>
        <AdminGrid
          items={[{ label: "Simulator", href: `/new/${slug}/admin/simulator`, desc: "View as a member, or override the clock" }]}
        />
      </div>

      {ctx.isSystemAdmin && (
        <div className={styles.section}>
          <p className={styles.sectionLabel}>Platform</p>
          <AdminGrid
            items={[{ label: "All groups", href: "/new/admin", desc: "Every group on the platform & system admins" }]}
          />
        </div>
      )}
    </div>
  );
}
