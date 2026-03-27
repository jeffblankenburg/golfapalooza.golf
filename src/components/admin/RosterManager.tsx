"use client";

import { useState, useEffect, useCallback } from "react";

interface UserWithStatus {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_participating: boolean;
  likelihood: number | null;
}

interface Trip {
  id: string;
  trip_name: string;
  trip_year: number;
}

export function RosterManager({ tripId: propTripId }: { tripId?: string } = {}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [users, setUsers] = useState<UserWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchTrip = useCallback(async () => {
    const url = propTripId
      ? `/api/admin/trips?id=${propTripId}`
      : "/api/admin/trips?status=active";
    const res = await fetch(url);
    const data = await res.json();
    if (data.trip) {
      setTrip(data.trip);
      return data.trip;
    }
    return null;
  }, [propTripId]);

  const fetchUsers = useCallback(async (tripId: string) => {
    const res = await fetch(`/api/admin/participants?trip_id=${tripId}`);
    const data = await res.json();
    if (data.users) setUsers(data.users);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const t = await fetchTrip();
      if (t) await fetchUsers(t.id);
      setLoading(false);
    }
    init();
  }, [fetchTrip, fetchUsers]);

  const toggleParticipation = async (userId: string, participating: boolean) => {
    if (!trip) return;

    // Optimistic update
    setUsers((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, is_participating: !participating } : u))
    );

    const method = participating ? "DELETE" : "POST";
    const res = await fetch("/api/admin/participants", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: trip.id, user_id: userId }),
    });

    if (!res.ok) {
      // Revert on failure
      setUsers((prev) =>
        prev.map((u) => (u.id === userId ? { ...u, is_participating: participating } : u))
      );
    }
  };

  const selectAllAttendees = async () => {
    if (!trip) return;
    setSaving("all");

    for (const user of users) {
      if (!user.is_participating) {
        await fetch("/api/admin/participants", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trip_id: trip.id, user_id: user.id }),
        });
      }
    }

    await fetchUsers(trip.id);
    setSaving(null);
  };

  const deselectAllAttendees = async () => {
    if (!trip) return;
    setSaving("all");

    for (const user of users) {
      if (user.is_participating) {
        await fetch("/api/admin/participants", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trip_id: trip.id, user_id: user.id }),
        });
      }
    }

    await fetchUsers(trip.id);
    setSaving(null);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-8 text-gray-500 text-sm">
        No active event found.
      </div>
    );
  }

  const participantCount = users.filter((u) => u.is_participating).length;

  // Sort: participating first (by likelihood desc, null last), then non-participating
  const sortedUsers = [...users].sort((a, b) => {
    if (a.is_participating !== b.is_participating) {
      return a.is_participating ? -1 : 1;
    }
    if (a.is_participating && b.is_participating) {
      const aLike = a.likelihood ?? -1;
      const bLike = b.likelihood ?? -1;
      if (aLike !== bLike) return bLike - aLike;
    }
    return (a.display_name || "").localeCompare(b.display_name || "");
  });

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <button
          onClick={selectAllAttendees}
          disabled={saving !== null}
          className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
        >
          All
        </button>
        <button
          onClick={deselectAllAttendees}
          disabled={saving !== null}
          className="text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
        >
          None
        </button>
        <span className="text-xs text-gray-400 ml-auto self-center">
          {participantCount} of {users.length}
        </span>
      </div>
      <div className="divide-y divide-gray-50 -mx-4">
        {sortedUsers.map((user) => (
          <button
            key={user.id}
            onClick={() => toggleParticipation(user.id, user.is_participating)}
            disabled={saving !== null}
            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
          >
            <div
              className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                user.is_participating
                  ? "bg-green-600 border-green-600"
                  : "border-gray-300"
              }`}
            >
              {user.is_participating && (
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </div>
            {user.avatar_url ? (
              <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                {(user.display_name || "?")[0].toUpperCase()}
              </div>
            )}
            <span className="text-sm font-medium text-gray-900 flex-1">
              {user.display_name || user.full_name || "Unknown"}
            </span>
            {user.is_participating && user.likelihood !== null && (
              <span
                className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                  user.likelihood >= 99
                    ? "bg-green-100 text-green-800"
                    : user.likelihood >= 75
                      ? "bg-blue-100 text-blue-800"
                      : user.likelihood >= 50
                        ? "bg-amber-100 text-amber-800"
                        : "bg-red-100 text-red-800"
                }`}
              >
                {user.likelihood}%
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
