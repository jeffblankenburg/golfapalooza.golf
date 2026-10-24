import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import SquaresManageView, { loadSquaresContestRow } from "./SquaresManageView";
import SquaresGamesButton from "./SquaresGamesButton";
import ContestEntryPaid from "./ContestEntryPaid";
import MasterPayouts from "./payouts/MasterPayouts";
import { loadMasterPayouts } from "./payouts/loadMasterPayouts";
// Same admin component the event lane uses — mounted here with the group API base.
import PickemAdmin, { type Game } from "../../events/[eventId]/contests/[contestId]/PickemAdmin";
import { listGames } from "@/lib/v2/contests/pickem-server";
import styles from "@/app/new/new.module.css";

export default async function SquaresDetailPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data: contest } = await supabase
    .from("v2_contests")
    .select("id, name, status, config, contest_type, org_id, payout_splits, collected_by")
    .eq("id", contestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contest) notFound();

  // Pick'em manage view — the shared PickemAdmin, mounted with the GROUP base.
  // No players link (group Pick'em is opt-in, not a managed roster).
  if (contest.contest_type === "pickem") {
    const [{ count: enrolled }, pickemGames] = await Promise.all([
      supabase.from("v2_contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", contestId),
      listGames(supabase, contestId),
    ]);
    return (
      <div className={styles.page}>
        <Link href={`/new/${slug}/admin/contests`} className={styles.back}>← Contests</Link>
        <div className={styles.titleRow}><h1 className={styles.title}>{contest.name}</h1></div>
        <PickemAdmin
          base={`/api/v2/orgs/${org.id}/contests/${contestId}`}
          showMoney={false}
          showStatus={false}
          initialStatus={contest.status as string}
          initialFeeCents={0}
          initialSplits={(contest.payout_splits as { place: number; kind: string; amount: number }[] | null) ?? []}
          enrolledCount={enrolled ?? 0}
          initialGames={pickemGames as Game[]}
        />
        <ContestEntryPaid orgId={org.id} contestId={contestId} title="Who's paid their entry" emptyText="No one's entered yet." />
      </div>
    );
  }

  if (contest.contest_type !== "squares") notFound();

  // Squares manage view (grids / reveals / results / paid) = the single on-page list.
  // Games + payouts are edited in a modal; the winnings sheet is a bottom collapsible.
  const squaresRow = await loadSquaresContestRow(supabase, contest);
  const payoutPeople = await loadMasterPayouts(supabase, contestId, (contest.config as Record<string, unknown>) ?? {}, org.name_display);
  return (
    <>
      <SquaresManageView
        supabase={supabase}
        contest={contest}
        base={`/api/v2/orgs/${org.id}/contests/${contestId}`}
        backHref={`/new/${slug}/admin/contests`}
        payoutsHref={`/new/${slug}/admin/contests/${contestId}/payouts`}
        playerHref={`/new/${slug}/contests/${contestId}`}
        nameMode={org.name_display}
      />
      <div className={styles.page} style={{ paddingTop: 0 }}>
        <SquaresGamesButton
          row={squaresRow}
          collectionBase={`/api/v2/orgs/${org.id}/contests`}
          nameMode={org.name_display}
          currentUserId={ctx.userId}
        />
        <ContestEntryPaid orgId={org.id} contestId={contestId} title="Who's paid for their squares" emptyText="No squares claimed yet." />
        <details style={{ marginTop: 20, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
          <summary style={{ padding: "12px 14px", cursor: "pointer", fontWeight: 700 }}>Winnings &amp; payouts</summary>
          <div style={{ padding: "0 14px 14px" }}>
            <MasterPayouts orgId={org.id} slug={slug} contestId={contestId} name={contest.name as string} people={payoutPeople} embedded />
          </div>
        </details>
      </div>
    </>
  );
}
