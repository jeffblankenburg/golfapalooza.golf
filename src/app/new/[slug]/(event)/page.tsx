import { redirect } from "next/navigation";
import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible, isFeatureActive } from "@/lib/v2/features";
import { loadOptionSettings, selectionsStillOpen } from "@/lib/v2/options";
import styles from "@/app/new/new.module.css";
import { getOnboardingState } from "@/lib/v2/onboarding";
import { v2Now } from "@/lib/v2/simulator";
import Countdown from "./Countdown";
import HomeModules from "./HomeModules";
import OnboardingChecklist from "./OnboardingChecklist";
import PwaInstallBanner from "./PwaInstallBanner";
import EventLocation from "./EventLocation";

interface EventRow {
  id: string;
  name: string;
  year: number | null;
  start_date: string | null;
  start_time: string | null;
  end_date: string | null;
  end_time: string | null;
  timezone: string | null;
  status: string;
  location: string | null;
}

/** "6:00 PM" from an "HH:MM" / "HH:MM:SS" wall-clock string (zone-agnostic). */
function fmtTime(t: string | null): string | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return null;
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m || 0).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}

function dateRange(
  start: string | null,
  end: string | null,
  startTime: string | null,
  endTime: string | null,
): string | null {
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
  // Single-day event — append a time range when set (e.g. a Super Bowl party
  // that runs 6:00–10:00 PM). Falls back to just the date.
  const st = fmtTime(startTime);
  const et = fmtTime(endTime);
  const time = st && et ? `${st} – ${et}` : st || null;
  return `${fmt(start)}, ${startYear}${time ? `, ${time}` : ""}`;
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
  // The active event (if any) powers the event hero + event-scoped modules. The
  // separate count tells "between events" (has events, none active) apart from a
  // group that doesn't run events at all — only the former gets a status note.
  const [activeRes, anyEventRes, memberCountRes] = await Promise.all([
    supabase
      .from("v2_events")
      .select("id, name, year, start_date, start_time, end_date, end_time, timezone, status, location")
      .eq("org_id", org.id)
      .eq("status", "active")
      .order("start_date", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("v2_events")
      .select("id", { count: "exact", head: true })
      .eq("org_id", org.id),
    // Member count for the no-event stripe (founding year comes from context).
    supabase
      .from("v2_memberships")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", org.id)
      .eq("status", "active")
      .is("archived_at", null),
  ]);
  const event = activeRes.data as EventRow | null;
  const hasAnyEvent = (anyEventRes.count ?? 0) > 0;
  const memberCount = memberCountRes.count ?? 0;
  const memberNoun = memberCount === 1 ? org.member_noun : org.member_noun_plural;
  // Admin-set founding year, falling back to the year the group was created.
  const foundedYear = org.founded_year ?? (org.created_at ? new Date(org.created_at).getFullYear() : null);
  const range = event ? dateRange(event.start_date, event.end_date, event.start_time, event.end_time) : null;

  // Home modules that mirror a registry feature honor its visibility.
  const isAdmin = org.role === "owner" || org.role === "admin";
  const resolved = await loadResolvedFeatures(supabase, org.id, event?.id ?? null);
  const articlesVisible = isFeatureVisible(resolved, "articles", isAdmin);
  const moneyVisible = isFeatureVisible(resolved, "my_money", isAdmin);
  // The activity feed's empty-state hint should only name producers that are
  // actually enabled (e.g. don't promise "rounds" when My Rounds is off).
  const activityProducers = [
    isFeatureVisible(resolved, "my_rounds", isAdmin) && "rounds",
    isFeatureVisible(resolved, "photos", isAdmin) && "photos",
    event && "RSVPs",
    isFeatureVisible(resolved, "music", isAdmin) && "songs",
  ].filter((v): v is string => typeof v === "string");
  // Options: visibility/open come from the feature window; the read-only cutoff is
  // the Options-specific close date. "Open" (editable) means both hold.
  const optionsFeat = event ? resolved.find((r) => r.def.key === "options") || null : null;
  let optionsOpen = false;
  if (optionsFeat && event) {
    const nowDate = await v2Now();
    const optSettings = await loadOptionSettings(supabase, event.id);
    optionsOpen = isFeatureActive(optionsFeat, isAdmin, nowDate) && selectionsStillOpen(optSettings, nowDate.getTime());
  }

  // First-run setup checklist — admins only, hidden once done or dismissed.
  const onboarding = isAdmin ? await getOnboardingState(supabase, org, isAdmin) : null;

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <PwaInstallBanner appName={org.name} />
      {onboarding?.show && (
        <OnboardingChecklist
          orgId={org.id}
          steps={onboarding.steps}
          completed={onboarding.completed}
          total={onboarding.total}
        />
      )}
      {event ? (
        <>
          <div className={styles.eventHero}>
            <h1 className={`${styles.title} ${styles.eventTitle}`}>{event.name}</h1>
          </div>
          {(range || event.start_date) && (
            <div className={styles.dateBand}>
              {range && <span className={styles.dateText}>{range}</span>}
              {event.start_date && <Countdown start={event.start_date} startTime={event.start_time} end={event.end_date} endTime={event.end_time} timeZone={event.timezone} nowMs={(await v2Now()).getTime()} />}
            </div>
          )}

          {event.location && (
            <div className={styles.locationBand}>
              <EventLocation location={event.location} />
            </div>
          )}
        </>
      ) : (
        // No active event: the group name takes the title slot. "Between events"
        // (the org has events, none active) adds a soft note; a group that doesn't
        // run events gets the name alone.
        <>
          <div className={styles.eventHero}>
            <h1 className={`${styles.title} ${styles.eventTitle}`}>{org.name}</h1>
            {hasAnyEvent && (
              <p className={styles.lede}>No event running right now. Check back soon.</p>
            )}
          </div>
          {/* Group stripe: the no-event analog of the event date/location band.
              Member count (→ directory) on the left, founding year on the right. */}
          <div className={styles.dateBand}>
            <Link href={`/new/${slug}/members`} className={styles.dateText}>
              {memberCount} {memberNoun}
            </Link>
            {foundedYear && <span className={styles.countdown}>Since {foundedYear}</span>}
          </div>
        </>
      )}

      {/* Group-scoped home (birthdays, group contests, article, My Money, activity,
          store, ads) renders with or without an active event. Event-scoped modules
          inside self-gate on the eventId. */}
      <HomeModules
        orgId={org.id}
        eventId={event?.id ?? null}
        userId={ctx.userId}
        slug={slug}
        eventName={event?.name ?? ""}
        storeUrl={org.store_url}
        storeLabel={org.store_label}
        storeEnabled={org.store_enabled}
        nameDisplay={org.name_display}
        articlesVisible={articlesVisible}
        optionsOpen={optionsOpen}
        moneyVisible={moneyVisible}
        activityProducers={activityProducers}
        timeZone={org.timezone}
      />
    </div>
  );
}
