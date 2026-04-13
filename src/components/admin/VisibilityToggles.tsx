"use client";

import { useState, useEffect, useCallback } from "react";
import { VISIBILITY_FEATURES, isFeatureVisible, type VisibilityFeature } from "@/lib/visibility";

interface TripData {
  id: string;
  start_date: string;
  visibility_overrides: Record<string, boolean>;
}

export function VisibilityToggles({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<TripData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    const res = await fetch(`/api/admin/trips?id=${tripId}`);
    const data = await res.json();
    if (data.trip) {
      setTrip({
        id: data.trip.id,
        start_date: data.trip.start_date,
        visibility_overrides: data.trip.visibility_overrides || {},
      });
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchTrip();
  }, [fetchTrip]);

  const toggleOverride = async (feature: VisibilityFeature) => {
    if (!trip) return;
    setSaving(feature);

    const newOverrides = { ...trip.visibility_overrides };
    if (newOverrides[feature]) {
      delete newOverrides[feature];
    } else {
      newOverrides[feature] = true;
    }

    setTrip({ ...trip, visibility_overrides: newOverrides });

    // Fetch full trip data for PUT (requires start_date)
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

    setSaving(null);
  };

  if (loading || !trip) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-400 text-center mb-3">
        Features auto-show based on time rules. Use &quot;Force&quot; to override for demos or testing.
      </p>
      {VISIBILITY_FEATURES.map((f) => {
        const autoVisible = isFeatureVisible(f.key, trip, now);
        const isForced = trip.visibility_overrides[f.key] === true;
        const effectivelyVisible = autoVisible || isForced;

        return (
          <div
            key={f.key}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-xl"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900 text-sm">{f.label}</p>
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
                Auto: {f.autoDescription}
                {isForced && !autoVisible && (
                  <span className="text-amber-600 font-medium"> · Forced on</span>
                )}
              </p>
            </div>
            <button
              onClick={() => toggleOverride(f.key)}
              disabled={saving === f.key}
              className={`ml-3 px-3 py-1.5 text-xs font-medium rounded-lg transition-colors disabled:opacity-50 ${
                isForced
                  ? "bg-amber-100 text-amber-700 border border-amber-200"
                  : "bg-white text-gray-500 border border-gray-200"
              }`}
            >
              {saving === f.key ? "..." : isForced ? "Forced" : "Force"}
            </button>
          </div>
        );
      })}
    </div>
  );
}
