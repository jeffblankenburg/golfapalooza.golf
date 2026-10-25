import { redirect, notFound } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { loadAuction } from "@/lib/v2/contests/auction-server";
import AuctionRecorder from "../AuctionRecorder";

/** Live auction administration — the draft runner, scope-agnostic (group or event). */
export default async function AuctionLivePage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const state = await loadAuction(supabase, contestId);
  if (!state || state.contest.orgId !== org.id) notFound();

  const backHref = state.isEvent && state.eventId
    ? `/new/${slug}/admin/events/${state.eventId}/contests/${contestId}`
    : `/new/${slug}/admin/contests/${contestId}`;

  return <AuctionRecorder slug={slug} apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`} state={state} backHref={backHref} />;
}
