import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import TeamsManager, { type Participant, type TeamData } from "../TeamsManager";
import styles from "@/app/new/new.module.css";

/** Scramble team building (#209) — separate from scoring. Owner/admin. */
export default async function ContestTeamsPage({ params }: { params: Promise<{ slug: string; eventId: string; contestId: string }> }) {
  const { slug, eventId, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: contest } = await admin
    .from("v2_contests").select("id, name, start_time").eq("id", contestId).eq("org_id", org.id).eq("event_id", eventId).maybeSingle();
  if (!contest) redirect(`/new/${slug}/admin/events/${eventId}/contests`);

  const [{ data: partRows }, { data: teamRows }] = await Promise.all([
    admin.from("v2_contest_participants").select("v2_profiles!inner(id, display_name, first_name, last_name, avatar_url)").eq("contest_id", contestId),
    admin.from("v2_scramble_teams").select("id, name, team_handicap, tee_time, starting_hole, sort_order, needs_attention_at").eq("contest_id", contestId).order("sort_order"),
  ]);
  // A member who bailed left an empty seat on a team (#217) — surfaced until re-saved.
  const needsAttention = (teamRows || []).some((t) => (t as { needs_attention_at?: string | null }).needs_attention_at);
  const partBase = (partRows || []).map((r) => {
    const p = (r as { v2_profiles: unknown }).v2_profiles as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null };
    return { user_id: p.id, display_name: p.display_name, first_name: p.first_name, last_name: p.last_name, avatar_url: p.avatar_url };
  });

  // Each player's handicap index (for the A/B/C/D generate-teams draft). Stored in
  // v2_player_handicaps; DECIMAL may arrive as a string, so coerce.
  const pIds = partBase.map((p) => p.user_id);
  const { data: hcpRows } = pIds.length
    ? await admin.from("v2_player_handicaps").select("user_id, handicap_index").in("user_id", pIds)
    : { data: [] as { user_id: string; handicap_index: number | string | null }[] };
  const hcpMap = new Map((hcpRows || []).map((h) => [h.user_id as string, h.handicap_index == null ? null : Number(h.handicap_index)]));
  const participants: Participant[] = partBase.map((p) => ({ ...p, handicap_index: hcpMap.get(p.user_id) ?? null }));

  const teamIds = (teamRows || []).map((t) => t.id);
  const { data: memberRows } = teamIds.length
    ? await admin.from("v2_scramble_team_members").select("team_id, user_id").in("team_id", teamIds)
    : { data: [] as { team_id: string; user_id: string }[] };
  const membersByTeam = new Map<string, string[]>();
  for (const m of memberRows || []) (membersByTeam.get(m.team_id) || membersByTeam.set(m.team_id, []).get(m.team_id)!).push(m.user_id);
  const initialTeams: TeamData[] = (teamRows || []).map((t) => ({
    id: t.id, name: t.name, team_handicap: t.team_handicap, tee_time: t.tee_time, members: membersByTeam.get(t.id) || [],
  }));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}/contests/${contestId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {contest.name}
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Teams</h1>
      </div>

      {needsAttention && (
        <p className={styles.attnBanner}>
          Someone who left the roster was dropped from a team here, so a seat is now empty. Reassign players and save to clear this.
        </p>
      )}

      {participants.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 18 }}>
          No one on the roster yet. Players come from this event&apos;s attendees (RSVP &ldquo;Attending&rdquo;).
        </p>
      ) : (
        <TeamsManager
          orgId={org.id}
          eventId={eventId}
          contestId={contest.id}
          participants={participants}
          initialTeams={initialTeams}
          contestStartTime={contest.start_time}
        />
      )}
    </div>
  );
}
