import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import SquaresManageView, { loadSquaresContestRow } from "./SquaresManageView";
import SquaresGamesButton from "./SquaresGamesButton";
import ContestEntryPaid from "./ContestEntryPaid";
import MasterPayouts from "./payouts/MasterPayouts";
import { loadMasterPayouts } from "./payouts/loadMasterPayouts";
import PickemPayouts from "./payouts/PickemPayouts";
import { loadPickemPayouts } from "./payouts/loadPickemPayouts";
import { type PayoutSplit } from "@/lib/v2/contests/pickem";
// Same admin component the event lane uses — mounted here with the group API base.
import PickemAdmin, { type Game } from "../../events/[eventId]/contests/[contestId]/PickemAdmin";
import { listGames } from "@/lib/v2/contests/pickem-server";
import { loadAuction, loadAuctionPayouts } from "@/lib/v2/contests/auction-server";
import AuctionManager from "./AuctionManager";
import { listQuestions, loadPropsPayouts } from "@/lib/v2/contests/props-server";
import PropsAdmin from "./PropsAdmin";
import { loadThreesState } from "@/lib/v2/contests/threes-server";
import ThreesManager from "./ThreesManager";
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
    .select("id, name, status, config, contest_type, org_id, payout_splits, collected_by, created_by")
    .eq("id", contestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contest) notFound();

  // Pick'em manage view — the shared PickemAdmin, mounted with the GROUP base.
  // No players link (group Pick'em is opt-in, not a managed roster).
  if (contest.contest_type === "pickem") {
    const [{ count: enrolled }, pickemGames, pickemPayouts] = await Promise.all([
      supabase.from("v2_contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", contestId),
      listGames(supabase, contestId),
      loadPickemPayouts(supabase, contestId, contest as Parameters<typeof loadPickemPayouts>[2], org.name_display),
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
          initialSplits={(contest.payout_splits as PayoutSplit[] | null) ?? []}
          enrolledCount={enrolled ?? 0}
          initialGames={pickemGames as Game[]}
          timeZone={org.timezone}
        />
        <ContestEntryPaid orgId={org.id} contestId={contestId} title="Who's paid their entry" emptyText="No one's entered yet." />
        <details style={{ marginTop: 20, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
          <summary style={{ padding: "12px 14px", cursor: "pointer", fontWeight: 700 }}>Winnings &amp; payouts</summary>
          <div style={{ padding: "0 14px 14px" }}>
            <PickemPayouts orgId={org.id} contestId={contestId} name={contest.name as string} ready={pickemPayouts.ready} people={pickemPayouts.people} />
          </div>
        </details>
      </div>
    );
  }

  // Auction manage view — the recorder + settings + participant enrollment.
  if (contest.contest_type === "auction") {
    const [state, payouts] = await Promise.all([
      loadAuction(supabase, contestId),
      loadAuctionPayouts(supabase, contestId),
    ]);
    if (!state) notFound();
    return (
      <AuctionManager
        slug={slug}
        apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`}
        state={state}
        payouts={payouts}
        payoutSplits={(contest.payout_splits as PayoutSplit[] | null) ?? []}
        backHref={`/new/${slug}/admin/contests`}
      />
    );
  }

  // Props manage view — question authoring + settlement + winnings (settings live on the card gear).
  if (contest.contest_type === "props") {
    const [questions, propsPayouts] = await Promise.all([
      listQuestions(supabase, contestId),
      loadPropsPayouts(supabase, contestId, org.name_display),
    ]);
    return (
      <PropsAdmin
        slug={slug}
        contestId={contestId}
        apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`}
        backHref={`/new/${slug}/admin/contests`}
        initialName={contest.name as string}
        initialQuestions={questions}
        payouts={propsPayouts}
      />
    );
  }

  // 3s and Ds manage view — the ESPN game picker + reactions editor + links to
  // the scorer console and the big board.
  if (contest.contest_type === "3s_and_ds") {
    const threes = await loadThreesState(supabase, contestId);
    if (!threes) notFound();
    return (
      <div className={styles.page}>
        <ThreesManager
          slug={slug}
          orgId={org.id}
          apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`}
          state={threes}
          backHref={`/new/${slug}/admin/contests`}
        />
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
        timeZone={org.timezone}
      />
      <div className={styles.page} style={{ paddingTop: 0 }}>
        <SquaresGamesButton
          row={squaresRow}
          collectionBase={`/api/v2/orgs/${org.id}/contests`}
          nameMode={org.name_display}
          currentUserId={ctx.userId}
          timeZone={org.timezone}
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
