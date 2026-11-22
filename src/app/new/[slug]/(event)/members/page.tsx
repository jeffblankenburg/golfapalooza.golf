import { redirect } from "next/navigation";
import { v2ServerClient, v2AdminClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import { loadMembersDirectory } from "@/lib/v2/members-directory";
import MembersDirectory from "@/components/v2/members/MembersDirectory";

/** The members directory — group-visible list of everyone, with follow controls. */
export default async function MembersPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const isAdmin = org.role === "owner" || org.role === "admin";
  const supabase = await v2ServerClient();
  const resolved = await loadResolvedFeatures(supabase, org.id, null);
  if (!isFeatureVisible(resolved, "loozers", isAdmin)) redirect(`/new/${slug}`);

  // Fetch the directory + the viewer's follows server-side so the grid renders with
  // the first paint instead of after a client JS-load → fetch waterfall.
  const admin = v2AdminClient();
  const [initialMembers, { data: favRows }] = await Promise.all([
    loadMembersDirectory(admin, org.id),
    admin.from("v2_user_favorites").select("favorite_user_id").eq("follower_id", ctx.userId),
  ]);
  const initialFollowing = (favRows || []).map((f) => f.favorite_user_id as string);

  return (
    <MembersDirectory
      slug={slug}
      orgId={org.id}
      viewerId={ctx.userId}
      title={org.member_noun_plural || "Members"}
      initialMembers={initialMembers}
      initialFollowing={initialFollowing}
    />
  );
}
