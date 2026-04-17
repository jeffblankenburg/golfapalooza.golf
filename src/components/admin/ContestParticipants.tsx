"use client";

import { useState, useEffect, useCallback } from "react";

interface User {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_participating: boolean;
}

export function ContestParticipants({
  contestId,
  tripId,
}: {
  contestId: string | null;
  tripId: string;
}) {
  const [users, setUsers] = useState<User[]>([]);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showRealNames, setShowRealNames] = useState(false);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/participants?trip_id=${tripId}`);
    const data = await res.json();
    if (data.users) setUsers(data.users);
  }, [tripId]);

  const fetchParticipants = useCallback(async () => {
    if (!contestId) return;
    const res = await fetch(`/api/admin/contests/participants?contest_id=${contestId}`);
    const data = await res.json();
    if (data.participants) {
      setParticipantIds(new Set(data.participants.map((p: { user_id: string }) => p.user_id)));
    }
  }, [contestId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchParticipants()]);
      setLoading(false);
    }
    init();
  }, [fetchUsers, fetchParticipants]);

  const toggle = async (userId: string) => {
    if (!contestId) return;
    const inContest = participantIds.has(userId);

    // Optimistic
    setParticipantIds((prev) => {
      const next = new Set(prev);
      if (inContest) next.delete(userId);
      else next.add(userId);
      return next;
    });

    const res = await fetch("/api/admin/contests/participants", {
      method: inContest ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contestId, user_id: userId }),
    });

    if (!res.ok) {
      // Revert
      setParticipantIds((prev) => {
        const next = new Set(prev);
        if (inContest) next.add(userId);
        else next.delete(userId);
        return next;
      });
    } else {
      window.dispatchEvent(new CustomEvent("contest-participants-changed"));
    }
  };

  const selectAll = async () => {
    if (!contestId) return;
    setSaving("all");
    const attendeeIds = attendees.map((u) => u.id);
    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contestId, user_ids: attendeeIds }),
    });
    await fetchParticipants();
    setSaving(null);
    window.dispatchEvent(new CustomEvent("contest-participants-changed"));
  };

  const deselectAll = async () => {
    if (!contestId) return;
    setSaving("all");
    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contestId, user_ids: [] }),
    });
    await fetchParticipants();
    setSaving(null);
    window.dispatchEvent(new CustomEvent("contest-participants-changed"));
  };

  if (!contestId) {
    return <p className="text-sm text-gray-400 text-center py-4">No contest found.</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const attendees = users.filter((u) => u.is_participating).sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );
  const count = participantIds.size;

  const getName = (u: User) =>
    showRealNames && u.full_name ? u.full_name : u.display_name;

  return (
    <div>
      {/* Header controls */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">{count} of {attendees.length} attendees</p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowRealNames(!showRealNames)}
            className="text-xs text-gray-400"
          >
            {showRealNames ? "Nicknames" : "Real names"}
          </button>
          <button
            onClick={selectAll}
            disabled={saving === "all"}
            className="text-xs text-green-700 font-medium"
          >
            All
          </button>
          <button
            onClick={deselectAll}
            disabled={saving === "all"}
            className="text-xs text-red-500 font-medium"
          >
            None
          </button>
        </div>
      </div>

      {/* Participant list */}
      <div className="divide-y divide-gray-100">
        {attendees.map((u) => {
          const inContest = participantIds.has(u.id);
          return (
            <button
              key={u.id}
              onClick={() => toggle(u.id)}
              className="flex items-center gap-3 py-2 w-full text-left"
            >
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 flex-shrink-0">
                  {u.display_name[0]?.toUpperCase()}
                </div>
              )}
              <span className="text-sm font-medium text-gray-900 flex-1 min-w-0 truncate">
                {getName(u)}
              </span>
              <div
                className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors flex-shrink-0 ${
                  inContest ? "bg-green-600 border-green-600" : "border-gray-300"
                }`}
              >
                {inContest && (
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
