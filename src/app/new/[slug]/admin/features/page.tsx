import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { resolveFeatures, type FeatureRow } from "@/lib/v2/features";
import FeaturesConfig from "@/app/new/_components/FeaturesConfig";

/**
 * Group-level feature configuration — features that apply across the whole group
 * (Articles, Music, Polls, My Rounds…), independent of any single event. Stored
 * as org-default rows (event_id NULL). Per-event features are configured under
 * each event's own Features screen.
 */
export default async function GroupFeaturesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const { data } = await supabase
    .from("v2_event_features")
    .select(
      "feature_key, event_id, visibility, pinned, nav_order, label_override, public, availability, available_from, available_until",
    )
    .eq("org_id", org.id)
    .is("event_id", null);

  // No event scope ("") → only org-default rows apply.
  const resolved = resolveFeatures((data as FeatureRow[] | null) ?? [], "");

  return (
    <FeaturesConfig
      scope="group"
      endpoint={`/api/v2/orgs/${org.id}/features`}
      initial={resolved}
      backHref={`/new/${slug}/admin`}
      backLabel="Admin"
      eyebrow="Group features"
      title="What's on"
      intro="Choose what your group uses everywhere. Each feature can be Off (hidden), on for Everyone, or Admins-only (to set it up before launch). These apply across all events; contests, schedule and other per-event features are set inside each event."
    />
  );
}
