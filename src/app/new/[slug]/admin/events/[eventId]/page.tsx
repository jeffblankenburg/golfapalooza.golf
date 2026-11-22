import Link from "next/link";
import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import styles from "@/app/new/new.module.css";
import AdminGrid from "@/app/new/_components/AdminGrid";
import FeatureVisibilityControl from "@/app/new/_components/FeatureVisibilityControl";

interface EventRow {
  id: string;
  name: string;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  status: string;
}

function dateRange(start: string | null, end: string | null): string | null {
  if (!start) return null;
  const fmt = (d: string) =>
    new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return end && end !== start ? `${fmt(start)} – ${fmt(end)}` : fmt(start);
}

export default async function EventAdmin({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data } = await supabase
    .from("v2_events")
    .select("id, name, year, start_date, end_date, status, timezone")
    .eq("id", eventId)
    .eq("org_id", org.id)
    .maybeSingle();
  const event = data as EventRow | null;
  if (!event) redirect(`/new/${slug}/admin`);
  const timeZone = ((data as { timezone?: string | null }).timezone) || org.timezone;

  const range = dateRange(event.start_date, event.end_date);

  // Member-visibility toggle rendered inline on each feature-backed card. Lights up
  // only for available, event-scoped, non-always-on features (as more port, they get
  // a toggle automatically via their key below).
  const resolved = await loadResolvedFeatures(supabase, org.id, eventId);
  const byKey = new Map(resolved.map((f) => [f.def.key, f]));
  const control = (key: string) => {
    const f = byKey.get(key);
    if (!f || f.def.status !== "available" || f.def.scope !== "event" || f.def.alwaysOn) return undefined;
    return (
      <FeatureVisibilityControl
        orgId={org.id}
        eventId={eventId}
        featureKey={key}
        topbar={f.def.topbar}
        timeZone={timeZone}
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
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Admin
      </Link>

      <div className={styles.titleRow}>
        <div className={styles.orgHeadText}>
          <p className={styles.eyebrow}>
            {event.status}
            {event.year ? ` (${event.year})` : ""}
          </p>
          <h1 className={styles.title}>{event.name}</h1>
        </div>
      </div>
      {range && <p className={styles.lede}>{range}</p>}

      <div className={styles.section}>
        <p className={styles.sectionLabel}>Event administration</p>
        <AdminGrid
          items={[
            { label: "Features", href: `/new/${slug}/admin/events/${eventId}/features`, desc: "Turn features on, pin & rename them" },
            { label: "Contests", href: `/new/${slug}/admin/events/${eventId}/contests`, desc: "Scramble, Skins, Pick'em, Calcutta, Cornhole…" },
            { label: "Tee Times", desc: "Groups & start times" },
            { label: "Teams", desc: "Team assignments" },
            { label: "Lodging", href: `/new/${slug}/admin/events/${eventId}/lodging`, desc: "Rooms & housing", control: control("rooms") },
            { label: "Schedule", href: `/new/${slug}/admin/events/${eventId}/schedule`, desc: "Per-day agenda & activities", control: control("schedule") },
            { label: "Financials", href: `/new/${slug}/admin/events/${eventId}/financials`, desc: "Costs, trip cost & payouts" },
            { label: "Attendance", desc: "RSVPs & roster" },
            { label: "Shirts", desc: "Sizes & orders" },
            { label: "Options", href: `/new/${slug}/admin/events/${eventId}/options`, desc: "Opt-in add-ons & their pricing", control: control("options") },
            { label: "Polls", desc: "Voting" },
            { label: "Awards", desc: "Accolades & nominations" },
            { label: "Info", desc: "Event details" },
          ]}
        />
      </div>
    </div>
  );
}
