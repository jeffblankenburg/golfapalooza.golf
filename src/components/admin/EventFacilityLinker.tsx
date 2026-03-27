"use client";

import { useState, useEffect, useCallback } from "react";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

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
  const [drawerOpen, setDrawerOpen] = useState(false);

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

  const linkedNames = facilities
    .filter((f) => linkedIds.has(f.id))
    .map((f) => f.name);

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-center py-2">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Card */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 text-left active:bg-gray-50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900">Facilities</div>
          <div className="text-xs text-gray-500">
            {linkedNames.length > 0
              ? `${linkedNames.length} linked`
              : "No facilities linked"}
          </div>
        </div>
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Drawer */}
      <BottomDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Facilities">
        {facilities.length === 0 ? (
          <div className="text-sm text-gray-500 text-center py-6">
            No facilities created yet. Add facilities in the Data Management section.
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {facilities.map((facility) => {
              const isLinked = linkedIds.has(facility.id);
              return (
                <button
                  key={facility.id}
                  onClick={() => toggleLink(facility.id)}
                  disabled={saving !== null}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  <div
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      isLinked ? "bg-green-600 border-green-600" : "border-gray-300"
                    }`}
                  >
                    {isLinked && (
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <span className="text-sm font-medium text-gray-900">{facility.name}</span>
                  {saving === facility.id && (
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin ml-auto" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </BottomDrawer>
    </>
  );
}
