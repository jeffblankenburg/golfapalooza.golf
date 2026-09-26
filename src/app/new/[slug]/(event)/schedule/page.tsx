import { redirect } from "next/navigation";
import Link from "next/link";
import { v2ServerClient, v2AdminClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import { v2Now } from "@/lib/v2/simulator";
import { toYMD } from "@/lib/v2/schedule";
import { buildMemberSchedule } from "@/lib/v2/schedule-feed";
import ScheduleAgenda from "../ScheduleAgenda";
import ScheduleSubscribe from "../ScheduleSubscribe";
import styles from "@/app/new/new.module.css";

/**
 * Member-facing schedule (#208) — ONE merged, read-only calendar for the whole
 * group: group-level items, active-event agendas, event spans and birthdays,
 * composed at read time. Gated by the schedule feature toggle.
 */
export default async function SchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const admin = v2AdminClient();
  const isAdmin = org.role === "owner" || org.role === "admin";

  // The active event (fall back to the most recent) drives the agenda AND the
  // feature scope — Schedule is an event-scoped feature, so it must be resolved
  // against this event's config (not org-default) or the toggle won't be seen.
  const { data: events } = await admin
    .from("v2_events")
    .select("id, name, start_date, end_date, status")
    .eq("org_id", org.id)
    .order("status", { ascending: true }) // 'active' sorts before 'archived'/'draft'
    .order("start_date", { ascending: false });
  const event = (events || []).find((e) => e.status === "active") || (events || [])[0] || null;

  const resolved = await loadResolvedFeatures(supabase, org.id, event?.id ?? null);
  if (!isFeatureVisible(resolved, "schedule", isAdmin)) redirect(`/new/${slug}`);

  const today = toYMD(await v2Now());
  const entries = await buildMemberSchedule(admin, org.id, {
    slug,
    today,
    includeBirthdays: org.show_birthdays,
    nameMode: org.name_display,
  });

  return (
    <div className={`${styles.page} ${styles.schedPage}`}>
      {/* Static header — breadcrumb + title + actions never move; the list scrolls
          beneath it (sits flush at the top, so there's no shift as you scroll). */}
      <div className={styles.schedHeader}>
        <Link href={`/new/${slug}`} className={styles.back}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>
        <div className={styles.schedTitleRow}>
          <h1 className={styles.title}>Schedule</h1>
          <ScheduleSubscribe orgId={org.id} />
        </div>
      </div>
      <ScheduleAgenda entries={entries} today={today} />
    </div>
  );
}
