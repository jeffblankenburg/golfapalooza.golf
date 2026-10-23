import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import BoxesManageView from "./BoxesManageView";
// Same admin component the event lane uses — mounted here with the group API base.
import PickemAdmin from "../../events/[eventId]/contests/[contestId]/PickemAdmin";
import ContestParticipants from "@/components/v2/contests/ContestParticipants";
import GroupContestMoney from "./GroupContestMoney";
import styles from "@/app/new/new.module.css";

export default async function BoxesDetailPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
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
    const { count: enrolled } = await supabase
      .from("v2_contest_participants").select("id", { count: "exact", head: true }).eq("contest_id", contestId);
    return (
      <div className={styles.page}>
        <Link href={`/new/${slug}/admin/contests`} className={styles.back}>← Contests</Link>
        <div className={styles.titleRow}><h1 className={styles.title}>{contest.name}</h1></div>
        <PickemAdmin
          base={`/api/v2/orgs/${org.id}/contests/${contestId}`}
          showMoney={false}
          initialStatus={contest.status as string}
          initialFeeCents={0}
          initialSplits={(contest.payout_splits as { place: number; kind: string; amount: number }[] | null) ?? []}
          enrolledCount={enrolled ?? 0}
        />
        <GroupContestMoney
          orgId={org.id}
          contestId={contestId}
          currentUserId={ctx.userId}
          nameMode={org.name_display}
          initialEntryCents={Number((contest.config as { entry_cents?: number } | null)?.entry_cents) || 0}
          initialCollectedBy={(contest.collected_by as string | null) ?? null}
        />
        <ContestParticipants apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`} />
      </div>
    );
  }

  if (contest.contest_type !== "boxes") notFound();

  // Boxes manage view — shared with the event lane; mounted with the GROUP links.
  return (
    <>
      <BoxesManageView
        supabase={supabase}
        contest={contest}
        base={`/api/v2/orgs/${org.id}/contests/${contestId}`}
        backHref={`/new/${slug}/admin/contests`}
        payoutsHref={`/new/${slug}/admin/contests/${contestId}/payouts`}
        playerHref={`/new/${slug}/contests/${contestId}`}
        editHref={`/new/${slug}/admin/contests?edit=${contestId}`}
        nameMode={org.name_display}
      />
      <div className={styles.page} style={{ paddingTop: 0 }}>
        <ContestParticipants apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`} />
      </div>
    </>
  );
}
