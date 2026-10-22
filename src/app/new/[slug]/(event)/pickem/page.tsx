import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { loadPickemBoard } from "@/lib/v2/contests/pickem-server";
import PickemContent from "./PickemContent";
import styles from "@/app/new/new.module.css";

/** Member Pick'em (#209) — pick games against the spread + a tiebreaker. The
 *  event-scoped entry: finds the active event's Pick'em, then renders the shared
 *  member UI off the shared board loader. The group lane uses the same loader. */
export default async function PickemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data: ev } = await supabase
    .from("v2_events").select("id").eq("org_id", org.id).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (!ev) redirect(`/new/${slug}`);

  const { data: contest } = await supabase
    .from("v2_contests").select("id, name, status")
    .eq("event_id", ev.id).eq("contest_type", "pickem").eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!contest) {
    return (
      <div className={`${styles.page} ${styles.orgPage}`}>
        <h1 className={styles.title}>Pick&apos;em</h1>
        <p className={styles.dnsHint} style={{ marginTop: 18 }}>The picks aren&apos;t open yet. Check back soon.</p>
      </div>
    );
  }

  const board = await loadPickemBoard(supabase, {
    contestId: contest.id as string,
    orgId: org.id,
    viewerId: ctx.userId,
    now: await v2Now(),
  });

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <h1 className={styles.title}>{contest.name || "Pick'em"}</h1>
      <PickemContent
        pickUrl={`/api/v2/events/${ev.id}/pickem/pick`}
        games={board.games}
        initialPicks={board.myPicks}
        leaderboard={board.leaderboard}
        locked={board.locked}
        meId={ctx.userId}
        totalGames={board.totalGames}
      />
    </div>
  );
}
