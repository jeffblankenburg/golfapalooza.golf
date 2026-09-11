import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import styles from "@/app/new/new.module.css";
import Countdown from "./Countdown";
import HomeModules from "./HomeModules";
import PwaInstallBanner from "./PwaInstallBanner";

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
  const fmt = (iso: string) =>
    new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const startYear = new Date(start + "T00:00:00").getFullYear();
  if (end && end !== start) {
    const endYear = new Date(end + "T00:00:00").getFullYear();
    return endYear !== startYear
      ? `${fmt(start)}, ${startYear} – ${fmt(end)}, ${endYear}`
      : `${fmt(start)} – ${fmt(end)}, ${startYear}`;
  }
  return `${fmt(start)}, ${startYear}`;
}

export default async function EventHome({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data } = await supabase
    .from("v2_events")
    .select("id, name, year, start_date, end_date, status")
    .eq("org_id", org.id)
    .eq("status", "active")
    .order("start_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  const event = data as EventRow | null;
  const range = event ? dateRange(event.start_date, event.end_date) : null;

  // Home modules that mirror a registry feature honor its visibility.
  const isAdmin = org.role === "owner" || org.role === "admin";
  const resolved = await loadResolvedFeatures(supabase, org.id, event?.id ?? null);
  const articlesVisible = isFeatureVisible(resolved, "articles", isAdmin);

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <PwaInstallBanner appName={org.name} />
      {event ? (
        <>
          <div className={styles.eventHero}>
            <h1 className={`${styles.title} ${styles.eventTitle}`}>{event.name}</h1>
          </div>
          {(range || event.start_date) && (
            <div className={styles.dateBand}>
              {range && <span className={styles.dateText}>{range}</span>}
              {event.start_date && <Countdown start={event.start_date} end={event.end_date} />}
            </div>
          )}

          <HomeModules
            orgId={org.id}
            eventId={event.id}
            userId={ctx.userId}
            slug={slug}
            eventName={event.name}
            storeUrl={org.store_url}
            storeLabel={org.store_label}
            storeEnabled={org.store_enabled}
            nameDisplay={org.name_display}
            articlesVisible={articlesVisible}
          />
        </>
      ) : (
        <div className={styles.eventHero}>
          <h1 className={styles.title}>No active event</h1>
          <p className={styles.lede}>There isn&apos;t an event running right now. Check back soon.</p>
        </div>
      )}
    </div>
  );
}
