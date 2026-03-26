"use client";

import { useState, useEffect, useCallback } from "react";

interface Facility {
  id: string;
  name: string;
  sort_order: number;
}

export function EventFacilityLinker({ tripId }: { tripId: string }) {
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [linkedIds, setLinkedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/rooms/facilities?trip_id=${tripId}`);
    const data = await res.json();
    if (data.facilities) setFacilities(data.facilities);
    if (data.linkedFacilityIds) setLinkedIds(new Set(data.linkedFacilityIds));
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleLink = async (facilityId: string) => {
    const isLinked = linkedIds.has(facilityId);
    setSaving(facilityId);

    await fetch("/api/admin/rooms/facilities", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        facility_id: facilityId,
        trip_id: tripId,
        linked: !isLinked,
      }),
    });

    await fetchData();
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (facilities.length === 0) {
    return (
      <div className="text-sm text-gray-500 text-center py-4">
        No facilities created yet. Add facilities in the Data Management section.
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <p className="text-xs text-gray-500 mb-2">
        Select which facilities are used for this event.
      </p>
      {facilities.map((facility) => {
        const isLinked = linkedIds.has(facility.id);
        return (
          <button
            key={facility.id}
            onClick={() => toggleLink(facility.id)}
            disabled={saving !== null}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-lg text-left active:bg-gray-50 transition-colors"
          >
            <div
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                isLinked
                  ? "bg-green-600 border-green-600"
                  : "border-gray-300"
              }`}
            >
              {isLinked && (
                <svg
                  className="w-4 h-4 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={3}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              )}
            </div>
            <span className="text-sm font-medium text-gray-900">
              {facility.name}
            </span>
            {saving === facility.id && (
              <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin ml-auto" />
            )}
          </button>
        );
      })}
    </div>
  );
}
