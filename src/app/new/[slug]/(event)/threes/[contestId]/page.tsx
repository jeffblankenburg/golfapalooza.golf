import { redirect, notFound } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { loadThreesState } from "@/lib/v2/contests/threes-server";
import { fetchGameScore } from "@/lib/v2/sports/espn";
import ThreesBoard from "@/app/new/[slug]/admin/contests/[contestId]/ThreesBoard";

/**
 * Member-facing 3s and Ds board — any member can pull the big board up on their
 * phone while the game is live. Read-only (no controls); the same full-screen
 * component the admin projects.
 */
export default async function MemberThreesBoardPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const threes = await loadThreesState(supabase, contestId);
  if (!threes || threes.contest.org_id !== org.id) notFound();

  const score =
    threes.game?.league && threes.game.espnEventId
      ? await fetchGameScore(threes.game.league, threes.game.espnEventId).catch(() => null)
      : null;

  return <ThreesBoard state={threes} score={score} exitHref={`/new/${slug}`} />;
}
