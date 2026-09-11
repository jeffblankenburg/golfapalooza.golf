import Link from "next/link";
import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import styles from "@/app/new/new.module.css";
import AdminGrid from "@/app/new/_components/AdminGrid";

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
    .select("id, name, year, start_date, end_date, status")
    .eq("id", eventId)
    .eq("org_id", org.id)
    .maybeSingle();
  const event = data as EventRow | null;
  if (!event) redirect(`/new/${slug}/admin`);

  const range = dateRange(event.start_date, event.end_date);

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
            { label: "Contests", desc: "Scramble, Skins, Pick'em, Calcutta, Cornhole…" },
            { label: "Tee Times", desc: "Groups & start times" },
            { label: "Teams", desc: "Team assignments" },
            { label: "Lodging", desc: "Rooms & housing" },
            { label: "Schedule", desc: "Itinerary" },
            { label: "Financials", desc: "Buy-ins & payouts" },
            { label: "Attendance", desc: "RSVPs & roster" },
            { label: "Shirts", desc: "Sizes & orders" },
            { label: "Options", desc: "Add-ons & extras" },
            { label: "Polls", desc: "Voting" },
            { label: "Awards", desc: "Accolades & nominations" },
            { label: "Info", desc: "Event details" },
          ]}
        />
      </div>
    </div>
  );
}
