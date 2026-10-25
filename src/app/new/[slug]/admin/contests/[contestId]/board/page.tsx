import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadAuction } from "@/lib/v2/contests/auction-server";
import AuctionBoard from "@/app/new/_components/AuctionBoard";
import styles from "@/app/new/new.module.css";

/** Projectable full-screen auction board (admin) — open on the big screen at the table. */
export default async function AuctionBoardPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const state = await loadAuction(supabase, contestId);
  if (!state || state.contest.orgId !== org.id) notFound();

  return (
    <div>
      <Link href={`/new/${slug}/admin/contests/${contestId}`} className={styles.back} style={{ padding: "12px 16px", display: "inline-block" }}>← Recorder</Link>
      <AuctionBoard state={state} viewerId={ctx.userId} projector />
    </div>
  );
}
