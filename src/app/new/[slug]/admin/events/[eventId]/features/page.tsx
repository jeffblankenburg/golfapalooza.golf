import { redirect } from "next/navigation";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { resolveFeatures, type FeatureRow } from "@/lib/v2/features";
import FeaturesConfig from "@/app/new/_components/FeaturesConfig";

/**
 * Per-event feature configuration (the registry admin screen). Lists every
 * catalogued feature grouped by bucket; admins enable the ones this event uses,
 * pin up to 3 to the bottom bar, rename them, and mark them public. Reads resolve
 * catalog-default < org-default < event-override (src/lib/v2/features.ts).
 */
export default async function EventFeaturesPage({
  params,
}: {
  params: Promise<{ slug: string; eventId: string }>;
}) {
  const { slug, eventId } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  const supabase = await v2ServerClient();
  const [eventRes, rowsRes] = await Promise.all([
    supabase.from("v2_events").select("id, name").eq("id", eventId).eq("org_id", org.id).maybeSingle(),
    supabase
      .from("v2_event_features")
      .select(
        "feature_key, event_id, visibility, pinned, nav_order, label_override, public, availability, available_from, available_until",
      )
      .eq("org_id", org.id)
      .or(`event_id.is.null,event_id.eq.${eventId}`),
  ]);
  if (!eventRes.data) redirect(`/new/${slug}/admin`);

  const resolved = resolveFeatures((rowsRes.data as FeatureRow[] | null) ?? [], eventId);

  return (
    <FeaturesConfig
      scope="event"
      endpoint={`/api/v2/orgs/${org.id}/events/${eventId}/features`}
      initial={resolved}
      backHref={`/new/${slug}/admin/events/${eventId}`}
      backLabel={eventRes.data.name as string}
      eyebrow="Event features"
      title="What's on"
      intro="Choose what this event uses. Each feature can be Off, on for Everyone, or Admins-only (to set it up first). Pin up to 3 to the bottom bar; everything else lives in the Everything menu. Group-wide features like Articles and Music are set in Group features."
    />
  );
}
