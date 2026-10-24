import { redirect, notFound } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { loadTournamentSource } from "@/lib/v2/contests/tournament-server";
import TournamentManager from "./TournamentManager";

export default async function TournamentDetailPage({ params }: { params: Promise<{ slug: string; tournamentId: string }> }) {
  const { slug, tournamentId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const admin = v2AdminClient();
  const src = await loadTournamentSource(admin, tournamentId);
  if (!src || src.tournament.org_id !== org.id) notFound();

  return (
    <TournamentManager
      orgId={org.id}
      slug={slug}
      tournament={src.tournament}
      teams={src.teams}
      games={src.games}
      champion={src.champion()}
      runnerUp={src.runnerUp()}
    />
  );
}
