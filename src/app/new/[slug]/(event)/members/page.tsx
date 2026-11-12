import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
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

  return (
    <MembersDirectory
      slug={slug}
      orgId={org.id}
      viewerId={ctx.userId}
      title={org.member_noun_plural || "Members"}
    />
  );
}
