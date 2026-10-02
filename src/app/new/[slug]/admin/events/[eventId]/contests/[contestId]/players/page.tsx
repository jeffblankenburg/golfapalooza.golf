import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { pickName } from "@/lib/v2/profile";
import ContestPlayers, { type ContestCandidate } from "../ContestPlayers";
import styles from "@/app/new/new.module.css";

/**
 * Contest players (#215) — enroll/remove, separate from Teams and Scoring. Players
 * are the authoritative roster for the contest; attendance only seeds it. Owner/admin.
 */
export default async function ContestPlayersPage({ params }: { params: Promise<{ slug: string; eventId: string; contestId: string }> }) {
  const { slug, eventId, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const { data: contest } = await admin
    .from("v2_contests").select("id, name").eq("id", contestId).eq("org_id", org.id).eq("event_id", eventId).maybeSingle();
  if (!contest) redirect(`/new/${slug}/admin/events/${eventId}/contests`);

  const [{ data: partRows }, { data: memberRows }, { data: rosterRows }] = await Promise.all([
    admin.from("v2_contest_participants").select("v2_profiles!inner(id, display_name, first_name, last_name)").eq("contest_id", contestId),
    admin.from("v2_memberships").select("user_id, member:v2_profiles(display_name, first_name, last_name)").eq("org_id", org.id).eq("status", "active").is("archived_at", null),
    admin.from("v2_event_participants").select("user_id").eq("event_id", eventId).eq("on_roster", true),
  ]);

  const initialPlayerIds = (partRows || []).map((r) => ((r as { v2_profiles: unknown }).v2_profiles as { id: string }).id);

  const rosterSet = new Set((rosterRows || []).map((r) => r.user_id as string));
  const memberCandidates: ContestCandidate[] = (memberRows || [])
    .map((m) => {
      const p = Array.isArray(m.member) ? m.member[0] : m.member;
      return { user_id: m.user_id as string, name: pickName(p, org.name_display), attending: rosterSet.has(m.user_id as string) };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/events/${eventId}/contests/${contestId}`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        {contest.name}
      </Link>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Players</h1>
      </div>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        Who&apos;s playing this contest. Everyone attending can be added at once, or pick specific members, a drop-in included. Teams and scoring draw from here.
      </p>

      <ContestPlayers
        orgId={org.id}
        eventId={eventId}
        contestId={contest.id}
        initialPlayerIds={initialPlayerIds}
        members={memberCandidates}
      />
    </div>
  );
}
