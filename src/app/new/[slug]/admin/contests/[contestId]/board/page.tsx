import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadAuction } from "@/lib/v2/contests/auction-server";
import AuctionBoard from "@/app/new/_components/AuctionBoard";
import { loadThreesState } from "@/lib/v2/contests/threes-server";
import { fetchGameScore, fetchGameSituation } from "@/lib/v2/sports/espn";
import ThreesBoard from "../ThreesBoard";

/** Projectable full-screen contest board (admin) — open on the big screen. */
export default async function ContestBoardPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();

  const { data: c } = await supabase
    .from("v2_contests")
    .select("contest_type, org_id")
    .eq("id", contestId)
    .maybeSingle();
  if (!c || c.org_id !== org.id) notFound();

  // 3s and Ds big board — live ESPN score + the manual event reactions.
  if (c.contest_type === "3s_and_ds") {
    const threes = await loadThreesState(supabase, contestId);
    if (!threes) notFound();
    const [score, situation] =
      threes.game?.league && threes.game.espnEventId
        ? await Promise.all([
            fetchGameScore(threes.game.league, threes.game.espnEventId).catch(() => null),
            fetchGameSituation(threes.game.league, threes.game.espnEventId).catch(() => null),
          ])
        : [null, null];
    return <ThreesBoard state={threes} score={score} situation={situation} />;
  }

  const state = await loadAuction(supabase, contestId);
  if (!state || state.contest.orgId !== org.id) notFound();
  // Full-screen projector takeover — the board itself covers the app chrome (fixed inset).
  return <AuctionBoard state={state} viewerId={ctx.userId} projector />;
}
