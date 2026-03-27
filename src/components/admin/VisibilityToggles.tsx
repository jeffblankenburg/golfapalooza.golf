"use client";

import { useState, useEffect, useCallback } from "react";

interface VisibilityState {
  show_tee_times: boolean;
  show_teams: boolean;
  show_rooms: boolean;
}

const toggles: { key: keyof VisibilityState; label: string; description: string }[] = [
  { key: "show_tee_times", label: "Tee Times", description: "Show tee times on schedule and home page" },
  { key: "show_teams", label: "Teams", description: "Show scramble teams and scores" },
  { key: "show_rooms", label: "Rooms", description: "Show room assignments" },
];

export function VisibilityToggles({ tripId }: { tripId: string }) {
  const [state, setState] = useState<VisibilityState>({
    show_tee_times: false,
    show_teams: false,
    show_rooms: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchState = useCallback(async () => {
    const res = await fetch(`/api/admin/trips?id=${tripId}`);
    const data = await res.json();
    if (data.trip) {
      setState({
        show_tee_times: data.trip.show_tee_times ?? false,
        show_teams: data.trip.show_teams ?? false,
        show_rooms: data.trip.show_rooms ?? false,
      });
    }
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  const toggle = async (key: keyof VisibilityState) => {
    const newValue = !state[key];
    setState((prev) => ({ ...prev, [key]: newValue }));
    setSaving(key);

    // Fetch full trip data first (PUT requires start_date)
    const tripRes = await fetch(`/api/admin/trips?id=${tripId}`);
    const tripData = await tripRes.json();
    const trip = tripData.trip;

    await fetch("/api/admin/trips", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: tripId,
        trip_name: trip.trip_name,
        trip_year: trip.trip_year,
        start_date: trip.start_date,
        location: trip.location,
        hotel_name: trip.hotel_name,
        hotel_address: trip.hotel_address,
        notes: trip.notes,
        [key]: newValue,
      }),
    });

    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-4">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">
        Control what Loozers can see. Hidden sections show a &quot;coming soon&quot; message.
      </p>
      {toggles.map((t) => (
        <button
          key={t.key}
          onClick={() => toggle(t.key)}
          disabled={saving === t.key}
          className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-xl"
        >
          <div className="text-left">
            <p className="font-medium text-gray-900">{t.label}</p>
            <p className="text-sm text-gray-500">{t.description}</p>
          </div>
          <div
            className={`relative w-11 h-6 rounded-full transition-colors ${
              state[t.key] ? "bg-green-600" : "bg-gray-300"
            }`}
          >
            <div
              className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                state[t.key] ? "translate-x-[22px]" : "translate-x-0.5"
              }`}
            />
          </div>
        </button>
      ))}
    </div>
  );
}
