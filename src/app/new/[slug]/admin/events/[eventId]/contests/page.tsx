import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { CONTEST_SELECT, contestTypeLabel, loadBuyInCents, type Contest } from "@/lib/v2/contests";
import { pickName } from "@/lib/v2/profile";
import { fmtTime } from "@/lib/v2/schedule";
import { buildPickemPreviews } from "@/lib/v2/contests/pickem-preview";
import { loadSquaresContestRow } from "../../../contests/[contestId]/SquaresManageView";
import AddScramble from "./AddScramble";
import AddCompetition from "./AddCompetition";
import EventContestsList, { type EventCard, type DayGroup, type SideRow } from "./EventContestsList";
import styles from "@/app/new/new.module.css";

/**
 * Event Contests hub (#209). The admin home for an event's competitive layer: dated
 * activities (scrambles) grouped by day with side games nested, plus event-wide
 * aggregates (BSPITW, 100 Feet!, Pick'em, Squares). Renders the SAME shared cards as
 * the group contests lane (accordion + gear + caret) — one card component, two lanes.
 * Owner/admin only.
 */

function dayLabel(ymd: string): string {
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });
}

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

// Types that play a course (so the gear shows the course/tee picker).
const GOLF_PLAYED = new Set(["scramble", "ryder_cup", "skins", "ctp", "long_drive", "long_putt"]);

export default async function EventContestsPage({ params }: { params: Promise<{ slug: string; eventId: string }> }) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const [{ data: event }, { data: contests }, { data: courseRows }] = await Promise.all([
    admin.from("v2_events").select("id, name, start_date, end_date").eq("id", eventId).eq("org_id", org.id).maybeSingle(),
    admin.from("v2_contests").select(CONTEST_SELECT).eq("event_id", eventId),
    admin.from("v2_courses").select("id, name, city, state").order("name"),
  ]);
  if (!event) redirect(`/new/${slug}/admin`);

  const all = (contests as Contest[]) || [];
  const allIds = all.map((c) => c.id);
  const scrambleIds = all.filter((c) => c.contest_type === "scramble" || c.contest_type === "ryder_cup").map((c) => c.id);
  const pickemIds = all.filter((c) => c.contest_type === "pickem").map((c) => c.id);
  const squaresIds = all.filter((c) => c.contest_type === "squares").map((c) => c.id);
  const sideIds = all.filter((c) => c.parent_contest_id).map((c) => c.id);

  const [{ data: parts }, { data: teams }, { data: pGames }, { data: sGames }, buyIns, { data: sideWins }] = await Promise.all([
    allIds.length ? admin.from("v2_contest_participants").select("contest_id").in("contest_id", allIds) : Promise.resolve({ data: [] as { contest_id: string }[] }),
    scrambleIds.length ? admin.from("v2_scramble_teams").select("contest_id, needs_attention_at").in("contest_id", scrambleIds) : Promise.resolve({ data: [] as { contest_id: string; needs_attention_at: string | null }[] }),
    pickemIds.length ? admin.from("v2_pickem_games").select("contest_id").in("contest_id", pickemIds) : Promise.resolve({ data: [] as { contest_id: string }[] }),
    squaresIds.length ? admin.from("v2_squares_games").select("contest_id").in("contest_id", squaresIds) : Promise.resolve({ data: [] as { contest_id: string }[] }),
    allIds.length ? loadBuyInCents(admin, allIds) : Promise.resolve(new Map<string, number>()),
    sideIds.length ? admin.from("v2_contest_winners").select("contest_id, user_id").in("contest_id", sideIds) : Promise.resolve({ data: [] as { contest_id: string; user_id: string | null }[] }),
  ]);

  const partCount = new Map<string, number>();
  for (const p of parts || []) partCount.set(p.contest_id, (partCount.get(p.contest_id) || 0) + 1);
  const teamCount = new Map<string, number>();
  const needsAttention = new Set<string>();
  for (const t of teams || []) {
    teamCount.set(t.contest_id, (teamCount.get(t.contest_id) || 0) + 1);
    if (t.needs_attention_at) needsAttention.add(t.contest_id);
  }
  const gameCount = new Map<string, number>();
  for (const g of pGames || []) gameCount.set(g.contest_id, (gameCount.get(g.contest_id) || 0) + 1);
  for (const g of sGames || []) gameCount.set(g.contest_id, (gameCount.get(g.contest_id) || 0) + 1);

  // Resolve side-game winner names.
  const winnerIdByContest = new Map<string, string>();
  for (const w of sideWins || []) if (w.user_id && !winnerIdByContest.has(w.contest_id)) winnerIdByContest.set(w.contest_id, w.user_id);
  const winnerUserIds = [...new Set([...winnerIdByContest.values()])];
  const { data: winnerProfiles } = winnerUserIds.length
    ? await admin.from("v2_profiles").select("id, display_name, first_name, last_name, nickname").in("id", winnerUserIds)
    : { data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; nickname: string | null }[] };
  const winnerName = new Map((winnerProfiles || []).map((p) => [p.id as string, pickName(p, org.name_display)]));

  const courses = (courseRows || []).map((c) => ({ id: c.id as string, name: c.name as string, city: (c.city as string) ?? null, state: (c.state as string) ?? null }));
  const courseNameById = new Map(courses.map((c) => [c.id, c.name]));

  // Full game-table previews for event Pick'em/Squares — the SAME renderers the group
  // lane uses, so the accordion shows the actual slate, not a summary.
  const pickemPreviews = await buildPickemPreviews(admin, pickemIds);
  const squaresRows = await Promise.all(
    all.filter((c) => c.contest_type === "squares").map(async (c) => [c.id, await loadSquaresContestRow(admin, c)] as const),
  );
  const squaresRowById = new Map(squaresRows);

  const sideGamesByParent = new Map<string, Contest[]>();
  for (const c of all) {
    if (!c.parent_contest_id) continue;
    (sideGamesByParent.get(c.parent_contest_id) || sideGamesByParent.set(c.parent_contest_id, []).get(c.parent_contest_id)!).push(c);
  }

  const base = `/new/${slug}/admin/events/${eventId}/contests`;

  function sideRow(s: Contest): SideRow {
    const hole = s.holes && s.holes.length ? s.holes[0] : null;
    const players = partCount.get(s.id) || 0;
    const wid = winnerIdByContest.get(s.id);
    const winner = s.declared_no_winner ? "No winner" : wid ? `Winner: ${winnerName.get(wid) || "set"}` : null;
    const meta = [contestTypeLabel(s.contest_type), hole ? `hole ${hole}` : null, winner].filter(Boolean).join(", ");
    // Right side: the participant count (consistent with the top-level card badge).
    const right = `${players} player${players === 1 ? "" : "s"}`;
    return { id: s.id, type: s.contest_type, name: s.name, meta, right };
  }

  function toCard(c: Contest): EventCard {
    const players = partCount.get(c.id) || 0;
    const nTeams = teamCount.get(c.id) || 0;
    const buy = buyIns.get(c.id) || 0;
    const when = fmtTime(c.start_time);
    const isGolfTeam = c.contest_type === "scramble" || c.contest_type === "ryder_cup";
    const games = gameCount.get(c.id) || 0;

    const facts: { label: string; value: string }[] = [];
    const sides = (sideGamesByParent.get(c.id) || []).map(sideRow);

    if (isGolfTeam) {
      facts.push({ label: "Teams", value: String(nTeams) }, { label: "Players", value: String(players) });
      facts.push({ label: "When", value: when || "No time set" });
      facts.push({ label: "Course", value: c.course_id ? courseNameById.get(c.course_id) || "Set" : "Not set" });
      if (buy > 0) facts.push({ label: "Buy-in", value: money(buy) });
    } else if (c.contest_type === "pickem" || c.contest_type === "squares") {
      facts.push({ label: "Games", value: String(games) });
      facts.push({ label: "Buy-in", value: buy > 0 ? money(buy) : "None" });
    } else {
      facts.push({ label: "Players", value: String(players) });
      if (buy > 0) facts.push({ label: "Buy-in", value: money(buy) });
    }

    // The count badge is ALWAYS the participant count (consistent across every type).
    // Buy-in stays in the small meta line / facts; the player count lives in the badge,
    // so it's pulled out of the meta to avoid showing it twice.
    const isPickSquares = c.contest_type === "pickem" || c.contest_type === "squares";
    const metaParts = isGolfTeam
      ? [when, `${nTeams} team${nTeams === 1 ? "" : "s"}`]
      : isPickSquares
        ? [buy > 0 ? `${money(buy)} buy-in` : "No buy-in"]
        : [when, buy > 0 ? `${money(buy)} buy-in` : null];
    const count = `${players} player${players === 1 ? "" : "s"}`;

    return {
      id: c.id,
      type: c.contest_type,
      name: c.name,
      meta: metaParts.filter(Boolean).join(", "),
      count,
      needsAttention: needsAttention.has(c.id),
      detailHref: `${base}/${c.id}`,
      facts,
      sides,
      bodyHint: (c.contest_type === "pickem" || c.contest_type === "squares") && games === 0 ? "Open to set up the games." : undefined,
      pickemGames: c.contest_type === "pickem" ? pickemPreviews.get(c.id) || [] : undefined,
      squaresRow: c.contest_type === "squares" ? squaresRowById.get(c.id) : undefined,
      gear: {
        contestDate: c.contest_date,
        startTime: c.start_time,
        courseId: c.course_id,
        teeId: c.tee_id,
        courseName: c.course_id ? courseNameById.get(c.course_id) || null : null,
        entryAmountCents: buy || null,
        config: c.config,
        showCourse: GOLF_PLAYED.has(c.contest_type),
      },
    };
  }

  const topLevel = all.filter((c) => !c.parent_contest_id);
  const dated = topLevel.filter((c) => c.contest_date);
  const eventWideContests = topLevel.filter((c) => !c.contest_date).sort((a, b) => a.sort_order - b.sort_order);

  const byDay = new Map<string, Contest[]>();
  for (const c of dated) (byDay.get(c.contest_date!) || byDay.set(c.contest_date!, []).get(c.contest_date!)!).push(c);
  const days: DayGroup[] = [...byDay.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([day, list]) => ({ day, label: dayLabel(day), cards: list.map(toCard) }));
  const eventWide = eventWideContests.map(toCard);

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
          <EventContestsList slug={slug} orgId={org.id} eventId={eventId} courses={courses} days={days} eventWide={[]} />
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
          <div style={{ marginTop: 10 }}>
            <EventContestsList slug={slug} orgId={org.id} eventId={eventId} courses={courses} days={[]} eventWide={eventWide} />
          </div>
        )}
      </div>
    </div>
  );
}
