import { redirect, notFound } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import MasterPayouts from "./MasterPayouts";
import { loadMasterPayouts } from "./loadMasterPayouts";

/** Pool-wide master payouts: who won how much across every game, with pay links. */
export default async function MasterPayoutsPage({ params }: { params: Promise<{ slug: string; contestId: string }> }) {
  const { slug, contestId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data: contest } = await supabase
    .from("v2_contests")
    .select("id, name, config, contest_type, org_id")
    .eq("id", contestId)
    .eq("org_id", org.id)
    .maybeSingle();
  if (!contest || contest.contest_type !== "squares") notFound();

  const people = await loadMasterPayouts(supabase, contestId, (contest.config as Record<string, unknown>) ?? {}, org.name_display);
  return <MasterPayouts orgId={org.id} slug={slug} contestId={contest.id} name={contest.name} people={people} />;
}
