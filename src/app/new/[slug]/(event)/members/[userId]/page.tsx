import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import MemberDetail from "@/components/v2/members/MemberDetail";

/** A member's detail page (group-visible) — profile, sponsor, accolades, follow. */
export default async function MemberDetailPage({ params }: { params: Promise<{ slug: string; userId: string }> }) {
  const { slug, userId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const isAdmin = org.role === "owner" || org.role === "admin";
  const supabase = await v2ServerClient();
  const resolved = await loadResolvedFeatures(supabase, org.id, null);
  if (!isFeatureVisible(resolved, "loozers", isAdmin)) redirect(`/new/${slug}`);

  return <MemberDetail slug={slug} orgId={org.id} memberId={userId} viewerId={ctx.userId} />;
}
