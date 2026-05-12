"use client";

import { useState, useEffect, useCallback } from "react";
import { VISIBILITY_FEATURES, isFeatureVisible, type VisibilityFeature } from "@/lib/visibility";

/**
 * One row in the Visibility section — also reusable inside the
 * feature's own admin accordion (e.g. Rooms) so the override toggle
 * lives next to the feature it controls.
 */
export function FeatureVisibilityRow({
  feature,
  tripId,
}: {
  feature: VisibilityFeature;
  tripId: string;
}) {
  const meta = VISIBILITY_FEATURES.find((f) => f.key === feature);
  const [trip, setTrip] = useState<
    | {
        start_date: string;
        visibility_overrides: Record<string, boolean>;
      }
    | null
  >(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchTrip = useCallback(async () => {
    const res = await fetch(`/api/admin/trips?id=${tripId}`);
    const data = await res.json();
    if (data.trip) {
      setTrip({
        start_date: data.trip.start_date,
        visibility_overrides: data.trip.visibility_overrides || {},
      });
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const setVisibility = async (visible: boolean) => {
    if (!trip) return;
    setSaving(true);

    const newOverrides = { ...trip.visibility_overrides, [feature]: visible };
    setTrip({ ...trip, visibility_overrides: newOverrides });

    const tripRes = await fetch(`/api/admin/trips?id=${tripId}`);
    const tripData = await tripRes.json();
    const fullTrip = tripData.trip;

    await fetch("/api/admin/trips", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: tripId,
        trip_name: fullTrip.trip_name,
        trip_year: fullTrip.trip_year,
        start_date: fullTrip.start_date,
        location: fullTrip.location,
        hotel_name: fullTrip.hotel_name,
        hotel_address: fullTrip.hotel_address,
        notes: fullTrip.notes,
        visibility_overrides: newOverrides,
      }),
    });

    setSaving(false);
  };

  if (loading || !trip || !meta) {
    return (
      <div className="flex items-center justify-center p-3 bg-gray-50 rounded-xl">
        <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const effectivelyVisible = isFeatureVisible(feature, trip, new Date());
  const override = trip.visibility_overrides[feature];
  const isOverridden = override === true || override === false;
  // Button label describes the action — clicking flips state.
  const nextAction = effectivelyVisible ? "Hide" : "Show";

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-900 text-sm">{meta.label}</p>
          <span
            className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${
              effectivelyVisible
                ? "bg-green-100 text-green-700"
                : "bg-gray-200 text-gray-500"
            }`}
          >
            {effectivelyVisible ? "Visible" : "Hidden"}
          </span>
        </div>
        <p className="text-xs text-gray-400 mt-0.5">
          Default: {meta.autoDescription}
          {isOverridden && (
            <span className="text-amber-600 font-medium">
              {" "}· Overridden ({override === true ? "shown" : "hidden"})
            </span>
          )}
        </p>
      </div>
      <button
        onClick={() => setVisibility(!effectivelyVisible)}
        disabled={saving}
        className={`ml-3 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
          effectivelyVisible
            ? "bg-white text-gray-500 border border-gray-200"
            : "bg-green-100 text-green-700 border border-green-200"
        }`}
      >
        {saving ? "..." : nextAction}
      </button>
    </div>
  );
}
