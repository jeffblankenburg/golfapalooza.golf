import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { toYMD } from "@/lib/v2/schedule";
import ScheduleEditor, { type ScheduleItem } from "./ScheduleEditor";
import styles from "@/app/new/new.module.css";

/**
 * Admin per-day schedule editor for an event (#208). Owner/admin only. Lays out
 * everything that happens across the event days: golf, side games, meals, TV, logistics.
 */
export default async function EventSchedulePage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const [{ data: event }, { data: items }] = await Promise.all([
    admin.from("v2_events").select("id, name, start_date, end_date").eq("id", eventId).eq("org_id", org.id).maybeSingle(),
    admin
      .from("v2_schedule_items")
      .select("id, title, description, location, day, end_day, start_time, end_time, all_day, sort_order, kind, activity_type, activity_id")
      .eq("event_id", eventId)
      .order("day")
      .order("start_time", { nullsFirst: true }),
  ]);
  if (!event) redirect(`/new/${slug}/admin`);

  const today = toYMD(await v2Now());

  return (
    <div className={`${styles.page} ${styles.schedPage}`}>
      <ScheduleEditor
        apiBase={`/api/v2/orgs/${org.id}/events/${eventId}/schedule`}
        today={today}
        initialItems={(items as ScheduleItem[]) || []}
        backHref={`/new/${slug}/admin/events/${eventId}`}
        backLabel={event.name}
        eventSpan={event.start_date ? { title: event.name, start: event.start_date, end: event.end_date } : undefined}
      />
    </div>
  );
}
