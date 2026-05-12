"use client";

import { VISIBILITY_FEATURES, type VisibilityFeature } from "@/lib/visibility";
import { FeatureVisibilityRow } from "./FeatureVisibilityRow";

// Features whose visibility toggle lives inside their own admin accordion
// (so admins find it next to the feature it controls instead of in a
// generic list). The row is still rendered — just somewhere else.
const EMBEDDED_FEATURES = new Set<VisibilityFeature>(["rooms"]);

export function VisibilityToggles({ tripId }: { tripId: string }) {
  const features = VISIBILITY_FEATURES.filter((f) => !EMBEDDED_FEATURES.has(f.key));

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 text-center mb-3">
        Features auto-show based on their default rule. Hit Show or Hide to override.
      </p>
      {features.map((f) => (
        <FeatureVisibilityRow key={f.key} feature={f.key} tripId={tripId} />
      ))}
    </div>
  );
}
