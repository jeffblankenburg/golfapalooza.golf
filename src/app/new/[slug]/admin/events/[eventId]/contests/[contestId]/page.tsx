import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { CONTEST_SELECT, contestTypeLabel, loadBuyInCents, type Contest } from "@/lib/v2/contests";
import { resolveContestHoles } from "@/lib/v2/contests/holes";
import { computeSkins } from "@/lib/v2/contests/skins";
import { fmtTime } from "@/lib/v2/schedule";
import ContestSettings from "./ContestSettings";
import SideGames, { type SideGame } from "./SideGames";
import PickemAdmin from "./PickemAdmin";
import ContestPayouts from "./ContestPayouts";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
import styles from "@/app/new/new.module.css";

/**
 * Contest overview (#209). The hub for one contest: its when/course, settings,
 * and links into the two jobs — Teams and Scoring — each on its own page. Owner/admin.
 */

function fmtDate(ymd: string | null): string | null {
  if (!ymd) return null;
  return new Date(ymd + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default async function ContestDetailPage({ params }: { params: Promise<{ slug: string; eventId: string; contestId: string }> }) {
  const { slug, eventId, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: contestRow } = await admin
    .from("v2_contests").select(CONTEST_SELECT)
    .eq("id", contestId).eq("org_id", org.id).eq("event_id", eventId).maybeSingle();
  const contest = contestRow as Contest | null;
  if (!contest) redirect(`/new/${slug}/admin/events/${eventId}/contests`);

  // Pick'em has its own admin surface (game slate + results + open/close + money).
  if (contest.contest_type === "pickem") {
    const [feeMap, { count: enrolled }] = await Promise.all([
      loadBuyInCents(admin, [contestId]),
      admin.from("v2_contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", contestId),
    ]);
    return (
      <div className={styles.page}>
        <Link href={`/new/${slug}/admin/events/${eventId}/contests`} className={styles.back}>
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
          </svg>
          Contests
        </Link>
        <div className={styles.titleRow}><h1 className={styles.title}>{contest.name}</h1></div>
        <PickemAdmin
          slug={slug} orgId={org.id} eventId={eventId} contestId={contestId}
          initialStatus={contest.status}
          initialFeeCents={feeMap.get(contestId) ?? 0}
          initialSplits={(contest.payout_splits as { place: number; kind: string; amount: number }[] | null) ?? []}
          enrolledCount={enrolled ?? 0}
        />
      </div>
    );
  }

  const [{ count: partCount }, { count: teamCount }, { data: courseRows }] = await Promise.all([
    admin.from("v2_contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", contestId),
    admin.from("v2_scramble_teams").select("id", { count: "exact", head: true }).eq("contest_id", contestId),
    admin.from("v2_courses").select("id, name, city, state").order("name"),
  ]);
  const players = partCount ?? 0;
  const numTeams = teamCount ?? 0;

  const courses = (courseRows || []).map((c) => ({ id: c.id as string, name: c.name as string, city: (c.city as string) ?? null, state: (c.state as string) ?? null }));
  const courseName = contest.course_id ? courses.find((c) => c.id === contest.course_id)?.name ?? null : null;

  const isCustomMix = !!(contest.config && (contest.config as { hole_tees?: unknown }).hole_tees);
  let teeLabel: string | null = null;
  if (isCustomMix) teeLabel = "Custom Tees";
  else if (contest.tee_id) {
    const { data: tee } = await admin.from("v2_course_tees").select("tee_name, par").eq("id", contest.tee_id).maybeSingle();
    teeLabel = tee ? `${tee.tee_name} tee (Par ${tee.par})` : null;
  }
  const courseLine = courseName ? [courseName, teeLabel].filter(Boolean).join(", ") : null;
  const hasTee = !!contest.tee_id;

  const dateLabel = fmtDate(contest.contest_date);
  const timeLabel = fmtTime(contest.start_time);
  const whenLabel = dateLabel && timeLabel ? `${dateLabel} at ${timeLabel}` : dateLabel;
  const base = `/new/${slug}/admin/events/${eventId}/contests/${contestId}`;

  // Side games (child contests) + their winners, the scramble's players (for the
  // winner picker), and the holes (for CTP/LD/LP hole selection).
  const { data: sideRows } = await admin
    .from("v2_contests")
    .select("id, contest_type, name, holes, config, declared_no_winner, sort_order")
    .eq("parent_contest_id", contestId)
    .order("sort_order");
  const sideIds = (sideRows || []).map((s) => s.id);
  // Buy-ins live in v2_cost_items (single source of truth, #213) — load them for
  // the scramble + its side games.
  const buyIns = await loadBuyInCents(admin, [contestId, ...sideIds]);
  const { data: sideWinners } = sideIds.length
    ? await admin.from("v2_contest_winners").select("contest_id, user_id").in("contest_id", sideIds)
    : { data: [] as { contest_id: string; user_id: string | null }[] };
  const winnerByContest = new Map<string, string | null>();
  for (const w of sideWinners || []) if (!winnerByContest.has(w.contest_id)) winnerByContest.set(w.contest_id, w.user_id);

  const scoreHoles = await resolveContestHoles(admin, { tee_id: contest.tee_id, config: contest.config });
  const holeInfos = scoreHoles.map((h) => ({ hole_number: h.hole_number, par: h.par, yards: h.yards, tee_color: h.tee_color, tee_name: h.tee_name }));

  // Compute skins results (per skins side game) from the scramble's team scores.
  const skinsByGame: Record<string, { rows: { team: string; skins: number }[]; pending: number }> = {};
  if ((sideRows || []).some((s) => s.contest_type === "skins")) {
    const { data: teamRows } = await admin.from("v2_scramble_teams").select("id, name, team_handicap, sort_order").eq("contest_id", contestId).order("sort_order");
    const tIds = (teamRows || []).map((t) => t.id);
    const { data: scoreRows } = tIds.length
      ? await admin.from("v2_scramble_hole_scores").select("team_id, hole_number, strokes").in("team_id", tIds)
      : { data: [] as { team_id: string; hole_number: number; strokes: number }[] };
    const scoresByTeam: Record<string, Record<number, number>> = {};
    for (const s of scoreRows || []) (scoresByTeam[s.team_id] ||= {})[s.hole_number] = s.strokes;
    const teamName = new Map((teamRows || []).map((t, i) => [t.id, t.name || `Team ${i + 1}`]));
    for (const s of sideRows || []) {
      if (s.contest_type !== "skins") continue;
      const cfg = (s.config || {}) as { skins_type?: string; carryover?: boolean };
      const res = computeSkins(teamRows || [], scoresByTeam, scoreHoles, { net: cfg.skins_type !== "gross", carryover: !!cfg.carryover });
      skinsByGame[s.id] = { rows: res.rows.map((r) => ({ team: teamName.get(r.team_id) || "Team", skins: r.skins })), pending: res.pending };
    }
  }

  const initialSideGames: SideGame[] = (sideRows || []).map((s) => ({
    id: s.id, contest_type: s.contest_type, name: s.name, holes: s.holes, config: s.config,
    entry_amount_cents: buyIns.get(s.id) ?? null, winner_user_id: winnerByContest.get(s.id) ?? null, declared_no_winner: s.declared_no_winner,
    skins_results: skinsByGame[s.id] ?? null,
  }));

  const { data: partProfiles } = await admin
    .from("v2_contest_participants").select("v2_profiles!inner(id, display_name, first_name, last_name)").eq("contest_id", contestId);
  const playerList = (partProfiles || []).map((r) => {
    const p = (r as { v2_profiles: unknown }).v2_profiles as { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
    return { user_id: p.id, name: p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Member" };
  });

  // Representative team size (most common) for the type-aware payout preview.
  let teamSize: number | null = null;
  if (contest.contest_type === "scramble" && numTeams > 0) {
    const { data: tms } = await admin.from("v2_scramble_teams").select("id").eq("contest_id", contestId);
    const teamIds = (tms || []).map((t) => t.id as string);
    if (teamIds.length) {
      const { data: mem } = await admin.from("v2_scramble_team_members").select("team_id").in("team_id", teamIds);
      const perTeam = new Map<string, number>();
      for (const m of mem || []) perTeam.set(m.team_id as string, (perTeam.get(m.team_id as string) || 0) + 1);
      const freq = new Map<number, number>();
      for (const c of perTeam.values()) freq.set(c, (freq.get(c) || 0) + 1);
      const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
      teamSize = top ? top[0] : null;
    }
  }
  const payoutSplits = ((contest.payout_splits as PayoutSplit[] | null) || []).slice().sort((a, b) => a.place - b.place);

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}/contests`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Contests
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>{contest.name}</h1>
        <ContestSettings
          slug={slug}
          orgId={org.id}
          eventId={eventId}
          contestId={contest.id}
          name={contest.name}
          contestDate={contest.contest_date}
          startTime={contest.start_time}
          courseId={contest.course_id}
          teeId={contest.tee_id}
          courseName={courseName}
          entryAmountCents={buyIns.get(contest.id) ?? null}
          courses={courses}
          config={contest.config}
        />
      </div>
      {whenLabel && <p className={styles.lede} style={{ marginTop: 6 }}>{whenLabel}</p>}
      {courseLine ? (
        <p className={styles.lede} style={{ marginTop: 2 }}>{courseLine}</p>
      ) : (
        <p className={styles.dnsHint} style={{ marginTop: 2 }}>No course set — pick one in settings to enable scoring.</p>
      )}
      <p className={styles.lede} style={{ marginTop: 2, color: "var(--ink-soft)" }}>{contestTypeLabel(contest.contest_type)}</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 20 }}>
        {[
          { href: `${base}/players`, title: "Players", meta: players === 0 ? "Add players" : `${players} player${players === 1 ? "" : "s"}` },
          { href: `${base}/teams`, title: "Teams", meta: `${numTeams} team${numTeams === 1 ? "" : "s"}, ${players} player${players === 1 ? "" : "s"}` },
          { href: `${base}/scoring`, title: "Scoring", meta: !hasTee ? "Set a course + tee first" : numTeams === 0 ? "Build teams first" : "Review the scorecard" },
        ].map((card) => (
          <Link key={card.title} href={card.href} className={styles.cscAcc} style={{ display: "block", textDecoration: "none" }}>
            <div className={styles.cscAccHead}>
              <span className={styles.cscAllMain}>
                <span className={styles.cscAllName}>{card.title}</span>
                <span className={styles.cscAllPlayers}>{card.meta}</span>
              </span>
              <svg className={styles.cscAccChevron} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
        <ContestPayouts
          base={`/api/v2/orgs/${org.id}/events/${eventId}/contests/${contestId}`}
          contestType={contest.contest_type}
          initialSplits={payoutSplits}
          feeCents={buyIns.get(contest.id) ?? 0}
          participantCount={players}
          teamSize={teamSize}
        />
      </div>

      <SideGames
        orgId={org.id}
        eventId={eventId}
        scrambleId={contest.id}
        players={playerList}
        holes={holeInfos}
        initialSideGames={initialSideGames}
      />
    </div>
  );
}
