import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { toYMD } from "@/lib/v2/schedule";
import ScheduleEditor, { type ScheduleItem } from "../events/[eventId]/schedule/ScheduleEditor";
import styles from "@/app/new/new.module.css";

/**
 * Group-level schedule editor (#208) — the org's calendar that isn't tied to any
 * one event (club meetings, dues deadlines, logistics, year-round dates). Owner/
 * admin only. Items are stored with event_id NULL; the merged member schedule folds
 * them in alongside event agendas and derived birthdays.
 */
export default async function GroupSchedulePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: items } = await admin
    .from("v2_schedule_items")
    .select("id, title, description, location, day, end_day, start_time, end_time, all_day, sort_order, kind, activity_type, activity_id")
    .eq("org_id", org.id)
    .is("event_id", null)
    .order("day")
    .order("start_time", { nullsFirst: true });

  const today = toYMD(await v2Now());

  return (
    <div className={`${styles.page} ${styles.schedPage}`}>
      <ScheduleEditor
        apiBase={`/api/v2/orgs/${org.id}/schedule`}
        today={today}
        initialItems={(items as ScheduleItem[]) || []}
        backHref={`/new/${slug}/admin`}
        backLabel="Admin"
        title="Group schedule"
      />
    </div>
  );
}
