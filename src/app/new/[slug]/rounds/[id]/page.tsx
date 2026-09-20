import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import RoundView from "./RoundView";

/**
 * Standalone round page — group-visible read-only scorecard + comments. Gated to
 * members of the group in the URL (the round detail API is itself open to any
 * authed user; this page is the entry point for non-players). Notification
 * deep-links land here with `?c=1` to auto-open comments.
 */
export default async function RoundPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; id: string }>;
  searchParams: Promise<{ c?: string }>;
}) {
  const { slug, id } = await params;
  const sp = await searchParams;
  const ctx = await getPlatformContext();
  if (!ctx) redirect(`/new/signup?org=${encodeURIComponent(slug)}`);
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  return <RoundView slug={slug} roundId={id} orgId={org.id} viewerId={ctx.userId} autoOpenComments={sp?.c === "1"} />;
}
