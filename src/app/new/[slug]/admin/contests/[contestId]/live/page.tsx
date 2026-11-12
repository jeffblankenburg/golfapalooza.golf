import { redirect, notFound } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { loadAuction } from "@/lib/v2/contests/auction-server";
import AuctionRecorder from "../AuctionRecorder";
import { loadThreesState } from "@/lib/v2/contests/threes-server";
import ThreesRecorder from "../ThreesRecorder";

/** Live contest administration — the recorder, scope-agnostic (group or event). */
export default async function ContestLivePage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();

  const { data: c } = await supabase
    .from("v2_contests")
    .select("contest_type, org_id")
    .eq("id", contestId)
    .maybeSingle();
  if (!c || c.org_id !== org.id) notFound();

  if (c.contest_type === "3s_and_ds") {
    const threes = await loadThreesState(supabase, contestId);
    if (!threes) notFound();
    return (
      <ThreesRecorder
        slug={slug}
        apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`}
        state={threes}
        backHref={`/new/${slug}/admin/contests/${contestId}`}
      />
    );
  }

  const state = await loadAuction(supabase, contestId);
  if (!state || state.contest.orgId !== org.id) notFound();

  const backHref = state.isEvent && state.eventId
    ? `/new/${slug}/admin/events/${state.eventId}/contests/${contestId}`
    : `/new/${slug}/admin/contests/${contestId}`;

  return <AuctionRecorder slug={slug} apiBase={`/api/v2/orgs/${org.id}/contests/${contestId}`} state={state} backHref={backHref} />;
}
