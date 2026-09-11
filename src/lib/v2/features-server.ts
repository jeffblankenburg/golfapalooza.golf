import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveFeatures, type FeatureRow, type ResolvedFeature } from "./features";

/**
 * Load + resolve the feature registry for an org (server-side). Merges org-default
 * rows with the given event's overrides. Returns every catalog feature resolved to
 * its effective config. Degrades to catalog defaults if the table isn't present.
 *
 * Use with `isFeatureVisible(resolved, key, viewerIsAdmin)` to gate feature
 * surfaces (home modules, routed pages) the same way the shell nav is gated.
 */
export async function loadResolvedFeatures(
  supabase: SupabaseClient,
  orgId: string,
  activeEventId: string | null,
): Promise<ResolvedFeature[]> {
  const filter = activeEventId
    ? `event_id.is.null,event_id.eq.${activeEventId}`
    : "event_id.is.null";
  const { data } = await supabase
    .from("v2_event_features")
    .select(
      "feature_key, event_id, visibility, pinned, nav_order, label_override, public, availability, available_from, available_until",
    )
    .eq("org_id", orgId)
    .or(filter);
  return resolveFeatures((data as FeatureRow[] | null) ?? [], activeEventId ?? "");
}
