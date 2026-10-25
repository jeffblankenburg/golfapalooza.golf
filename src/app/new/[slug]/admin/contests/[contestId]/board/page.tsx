import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadAuction } from "@/lib/v2/contests/auction-server";
import AuctionBoard from "@/app/new/_components/AuctionBoard";

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

  // Full-screen projector takeover — the board itself covers the app chrome (fixed inset).
  return <AuctionBoard state={state} viewerId={ctx.userId} projector />;
}
