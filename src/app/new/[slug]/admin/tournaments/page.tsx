import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import TournamentsAdmin from "./TournamentsAdmin";

/**
 * Shared tournaments admin (#226): bracketed events (March Madness, playoffs) that
 * contests sit on. Create one, build its seeded field, generate the bracket, enter
 * results. Owner/admin only.
 */
export default async function TournamentsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org || (org.role !== "owner" && org.role !== "admin")) redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data } = await supabase
    .from("v2_tournaments").select("id, name, sport, season, status, source").eq("org_id", org.id).order("created_at", { ascending: false });

  return <TournamentsAdmin orgId={org.id} slug={slug} tournaments={data ?? []} />;
}
