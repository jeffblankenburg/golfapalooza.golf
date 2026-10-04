import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { resolveContestHoles } from "@/lib/v2/contests/holes";
import ScoringManager from "../ScoringManager";
import styles from "@/app/new/new.module.css";

/** Scramble scoring review (#209) — separate from team building. Owner/admin. */
export default async function ContestScoringPage({ params }: { params: Promise<{ slug: string; eventId: string; contestId: string }> }) {
  const { slug, eventId, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: contest } = await admin
    .from("v2_contests").select("id, name, tee_id, config").eq("id", contestId).eq("org_id", org.id).eq("event_id", eventId).maybeSingle();
  if (!contest) redirect(`/new/${slug}/admin/events/${eventId}/contests`);

  const cfg = contest.config as Record<string, unknown> | null;
  const holes = await resolveContestHoles(admin, { tee_id: contest.tee_id as string | null, config: cfg });
  // Per-player observations (greens/putts/etc.) belong to the CONSUMING contest
  // (BSPITW / 100 Feet / CTP), not the scramble. Until those are built and declare
  // which v2_scoring_metrics they collect, the scramble scorer collects none.
  // TODO(#220): compute the union of metrics required by consuming contests here.
  const trackGreens = false;
  const trackPutts = false;

  const { data: teamRows } = await admin
    .from("v2_scramble_teams").select("id, name, team_handicap, sort_order").eq("contest_id", contestId).order("sort_order");
  const teamIds = (teamRows || []).map((t) => t.id);
  const [{ data: memberRows }, { data: scoreRows }, { data: obsRows }, { data: partRows }] = await Promise.all([
    teamIds.length ? admin.from("v2_scramble_team_members").select("team_id, user_id").in("team_id", teamIds) : Promise.resolve({ data: [] as { team_id: string; user_id: string }[] }),
    teamIds.length ? admin.from("v2_scramble_hole_scores").select("team_id, hole_number, strokes").in("team_id", teamIds) : Promise.resolve({ data: [] as { team_id: string; hole_number: number; strokes: number }[] }),
    admin.from("v2_contest_observations").select("user_id, hole_number, metric, value").eq("contest_id", contestId),
    admin.from("v2_contest_participants").select("v2_profiles!inner(id, display_name, first_name, last_name)").eq("contest_id", contestId),
  ]);
  const membersByTeam = new Map<string, string[]>();
  for (const m of memberRows || []) (membersByTeam.get(m.team_id) || membersByTeam.set(m.team_id, []).get(m.team_id)!).push(m.user_id);
  const teams = (teamRows || []).map((t) => ({ id: t.id, name: t.name, team_handicap: t.team_handicap, members: membersByTeam.get(t.id) || [] }));

  const names: Record<string, string> = {};
  for (const r of partRows || []) {
    const p = (r as { v2_profiles: unknown }).v2_profiles as { id: string; display_name: string | null; first_name: string | null; last_name: string | null };
    names[p.id] = p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Member";
  }

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}/contests/${contestId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {contest.name}
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Scoring</h1>
      </div>

      <ScoringManager
        orgId={org.id}
        eventId={eventId}
        contestId={contest.id}
        holes={holes}
        teams={teams}
        initialScores={scoreRows || []}
        initialObs={obsRows || []}
        names={names}
        trackGreens={trackGreens}
        trackPutts={trackPutts}
      />
    </div>
  );
}
