import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { CONTEST_SELECT, type Contest } from "@/lib/v2/contests";
import { fmtTime } from "@/lib/v2/schedule";
import AddScramble from "./AddScramble";
import AddCompetition from "./AddCompetition";
import styles from "@/app/new/new.module.css";

/**
 * Event Contests hub (#209, Phase 2a). The admin home for an event's competitive
 * layer: dated activities (scrambles) grouped by day with side games nested, plus
 * event-wide aggregates (BSPITW, 100 Feet!). Contests are authored HERE; the
 * calendar derives its entries from each contest's date. Owner/admin only.
 */

function dayLabel(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

export default async function EventContestsPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const [{ data: event }, { data: contests }] = await Promise.all([
    admin.from("v2_events").select("id, name, start_date, end_date").eq("id", eventId).eq("org_id", org.id).maybeSingle(),
    admin.from("v2_contests").select(CONTEST_SELECT).eq("event_id", eventId),
  ]);
  if (!event) redirect(`/new/${slug}/admin`);

  const all = (contests as Contest[]) || [];
  const contestIds = all.map((c) => c.id);
  const scrambleIds = all.filter((c) => c.contest_type === "scramble").map((c) => c.id);

  const [{ data: parts }, { data: teams }] = await Promise.all([
    contestIds.length
      ? admin.from("v2_contest_participants").select("contest_id").in("contest_id", contestIds)
      : Promise.resolve({ data: [] as { contest_id: string }[] }),
    scrambleIds.length
      ? admin.from("v2_scramble_teams").select("contest_id, needs_attention_at").in("contest_id", scrambleIds)
      : Promise.resolve({ data: [] as { contest_id: string; needs_attention_at: string | null }[] }),
  ]);
  const partCount = new Map<string, number>();
  for (const p of parts || []) partCount.set(p.contest_id, (partCount.get(p.contest_id) || 0) + 1);
  const teamCount = new Map<string, number>();
  const needsAttention = new Set<string>(); // contest ids with a team that lost a seat (#217)
  for (const t of teams || []) {
    teamCount.set(t.contest_id, (teamCount.get(t.contest_id) || 0) + 1);
    if ((t as { needs_attention_at?: string | null }).needs_attention_at) needsAttention.add(t.contest_id);
  }

  const sideGamesByParent = new Map<string, Contest[]>();
  for (const c of all) {
    if (!c.parent_contest_id) continue;
    (sideGamesByParent.get(c.parent_contest_id) || sideGamesByParent.set(c.parent_contest_id, []).get(c.parent_contest_id)!).push(c);
  }

  const topLevel = all.filter((c) => !c.parent_contest_id);
  const dated = topLevel.filter((c) => c.contest_date);
  const eventWide = topLevel.filter((c) => !c.contest_date).sort((a, b) => a.sort_order - b.sort_order);

  const byDay = new Map<string, Contest[]>();
  for (const c of dated) (byDay.get(c.contest_date!) || byDay.set(c.contest_date!, []).get(c.contest_date!)!).push(c);
  const days = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  const base = `/new/${slug}/admin/events/${eventId}/contests`;

  function statusLine(c: Contest): string {
    const people = partCount.get(c.id) || 0;
    const counts = c.contest_type === "scramble"
      ? `${teamCount.get(c.id) || 0} team${(teamCount.get(c.id) || 0) === 1 ? "" : "s"}, ${people} player${people === 1 ? "" : "s"}`
      : `${people} player${people === 1 ? "" : "s"}`;
    const t = fmtTime(c.start_time);
    return t ? `${t}, ${counts}` : counts;
  }

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {event.name}
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Contests</h1>
        <AddScramble orgId={org.id} eventId={eventId} startDate={event.start_date} endDate={event.end_date} />
      </div>

      {days.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 16 }}>
          No contests yet. Add a scramble with the + above; it&apos;ll show on the event calendar automatically.
        </p>
      ) : (
        <div className={styles.contestDays}>
          {days.map(([day, dayContests]) => (
            <div key={day} className={styles.contestDay}>
              <div className={styles.schedDateHead}>{dayLabel(day)}</div>
              {dayContests.map((c) => {
                const sides = sideGamesByParent.get(c.id) || [];
                return (
                  <div key={c.id} className={styles.contestGroup}>
                    <Link href={`${base}/${c.id}`} className={styles.contestCard} data-setup="1">
                      <span className={styles.contestCardMain}>
                        <span className={styles.contestCardTitle}>
                          {c.name}
                          {needsAttention.has(c.id) && <span className={styles.needsAttn}>Needs attention</span>}
                        </span>
                        <span className={styles.contestCardMeta}>{statusLine(c)}</span>
                      </span>
                      <svg className={styles.contestChevron} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                      </svg>
                    </Link>
                    {sides.length > 0 && (
                      <div className={styles.contestSides}>
                        {sides.map((s) => (
                          <div key={s.id} className={styles.contestSide}>
                            <span>{s.name}</span>
                            <span className={styles.contestSideMeta}>{partCount.get(s.id) || 0}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.titleRow}>
          <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Event-wide</p>
          <AddCompetition orgId={org.id} eventId={eventId} />
        </div>
        {eventWide.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 10 }}>
            Cross-day competitions like BSPITW and 100 Feet! that span every scramble.
          </p>
        ) : (
          <div className={styles.contestDays} style={{ marginTop: 10 }}>
            {eventWide.map((c) => (
              <Link key={c.id} href={`${base}/${c.id}`} className={styles.contestCard} data-setup="1">
                <span className={styles.contestCardMain}>
                  <span className={styles.contestCardTitle}>{c.name}</span>
                  <span className={styles.contestCardMeta}>{c.contest_type === "pickem" ? "Tap to set up games" : "Runs all event"}</span>
                </span>
                <svg className={styles.contestChevron} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                </svg>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
