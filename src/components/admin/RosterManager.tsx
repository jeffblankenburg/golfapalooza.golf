"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface UserWithStatus {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_participating: boolean;
  likelihood: number | null;
}

interface Contest {
  id: string;
  trip_id: string;
  name: string;
  contest_type: string;
  day_number: number | null;
  sort_order: number;
  participant_count: number;
}

interface ContestParticipant {
  user_id: string;
  user:
    | {
        id: string;
        display_name: string;
        full_name: string | null;
        avatar_url: string | null;
      }[]
    | {
        id: string;
        display_name: string;
        full_name: string | null;
        avatar_url: string | null;
      }
    | null;
}

interface Trip {
  id: string;
  trip_name: string;
  trip_year: number;
}

type View = "roster" | "contests" | "contest-detail";

export function RosterManager({ tripId: propTripId }: { tripId?: string } = {}) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [users, setUsers] = useState<UserWithStatus[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [view, setView] = useState<View>("roster");
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [contestParticipantIds, setContestParticipantIds] = useState<
    Set<string>
  >(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // New contest form
  const [showNewContest, setShowNewContest] = useState(false);
  const [newContestName, setNewContestName] = useState("");
  const [newContestType, setNewContestType] = useState("other");
  const [newContestDay, setNewContestDay] = useState("");

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
    if (data.users) {
      setUsers(data.users);
    }
  }, []);

  const fetchContests = useCallback(async (tripId: string) => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    if (data.contests) {
      setContests(data.contests);
    }
  }, []);

  const fetchContestParticipants = useCallback(async (contestId: string) => {
    const res = await fetch(
      `/api/admin/contests/participants?contest_id=${contestId}`
    );
    const data = await res.json();
    if (data.participants) {
      const ids = new Set<string>(
        data.participants.map((p: ContestParticipant) => p.user_id)
      );
      setContestParticipantIds(ids);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const t = await fetchTrip();
      if (t) {
        await Promise.all([fetchUsers(t.id), fetchContests(t.id)]);
      }
      setLoading(false);
    }
    init();
  }, [fetchTrip, fetchUsers, fetchContests]);

  const toggleParticipation = async (userId: string, participating: boolean) => {
    if (!trip) return;

    // Optimistically update UI immediately
    setUsers((prev) =>
      prev.map((u) =>
        u.id === userId ? { ...u, is_participating: !participating } : u
      )
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
        prev.map((u) =>
          u.id === userId ? { ...u, is_participating: participating } : u
        )
      );
      return;
    }

    // Update contest participant counts locally
    if (!participating) {
      // Added to event — they get auto-added to all contests
      setContests((prev) =>
        prev.map((c) => ({ ...c, participant_count: c.participant_count + 1 }))
      );
    } else {
      // Removed from event — they get removed from all contests
      setContests((prev) =>
        prev.map((c) => ({
          ...c,
          participant_count: Math.max(0, c.participant_count - 1),
        }))
      );
    }
  };

  const toggleContestParticipant = async (
    userId: string,
    inContest: boolean
  ) => {
    if (!selectedContest) return;

    // Optimistically update UI
    setContestParticipantIds((prev) => {
      const next = new Set(prev);
      if (inContest) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
    setContests((prev) =>
      prev.map((c) =>
        c.id === selectedContest.id
          ? {
              ...c,
              participant_count: c.participant_count + (inContest ? -1 : 1),
            }
          : c
      )
    );

    const method = inContest ? "DELETE" : "POST";
    const res = await fetch("/api/admin/contests/participants", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: selectedContest.id,
        user_id: userId,
      }),
    });

    if (!res.ok) {
      // Revert on failure
      setContestParticipantIds((prev) => {
        const next = new Set(prev);
        if (inContest) {
          next.add(userId);
        } else {
          next.delete(userId);
        }
        return next;
      });
      setContests((prev) =>
        prev.map((c) =>
          c.id === selectedContest.id
            ? {
                ...c,
                participant_count: c.participant_count + (inContest ? 1 : -1),
              }
            : c
        )
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

    await Promise.all([fetchUsers(trip.id), fetchContests(trip.id)]);
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

    await Promise.all([fetchUsers(trip.id), fetchContests(trip.id)]);
    setSaving(null);
  };

  const selectAllContestParticipants = async () => {
    if (!selectedContest || !trip) return;
    setSaving("all");

    const attendeeIds = users
      .filter((u) => u.is_participating)
      .map((u) => u.id);

    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: selectedContest.id,
        user_ids: attendeeIds,
      }),
    });

    await Promise.all([
      fetchContestParticipants(selectedContest.id),
      fetchContests(trip.id),
    ]);
    setSaving(null);
  };

  const deselectAllContestParticipants = async () => {
    if (!selectedContest || !trip) return;
    setSaving("all");

    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: selectedContest.id,
        user_ids: [],
      }),
    });

    await Promise.all([
      fetchContestParticipants(selectedContest.id),
      fetchContests(trip.id),
    ]);
    setSaving(null);
  };

  const openContestDetail = async (contest: Contest) => {
    setSelectedContest(contest);
    await fetchContestParticipants(contest.id);
    setView("contest-detail");
  };

  const createContest = async () => {
    if (!trip || !newContestName.trim()) return;
    setSaving("new");

    await fetch("/api/admin/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: trip.id,
        name: newContestName.trim(),
        contest_type: newContestType,
        day_number: newContestDay ? parseInt(newContestDay) : null,
        sort_order: contests.length + 1,
      }),
    });

    await fetchContests(trip.id);
    setNewContestName("");
    setNewContestType("other");
    setNewContestDay("");
    setShowNewContest(false);
    setSaving(null);
  };

  const deleteContest = (contestId: string) => {
    if (!trip) return;

    setConfirmModal({
      title: "Delete Contest",
      message: "This will permanently delete this contest and remove all participant data.",
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/contests", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: contestId }),
        });
        await fetchContests(trip.id);
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="text-center py-12 text-gray-500">
        No active event found. Create one in Trip Settings.
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

  // ── Roster View ──
  if (view === "roster") {
    return (
      <div>
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Event Roster</h1>
        <p className="text-sm text-gray-500 mb-6">
          {trip.trip_name} {trip.trip_year}
        </p>

        {/* Participants Section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              Participants ({participantCount} of {users.length})
            </h2>
            <div className="flex gap-2">
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
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {sortedUsers.map((user) => (
              <button
                key={user.id}
                onClick={() =>
                  toggleParticipation(user.id, user.is_participating)
                }
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
                {user.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt=""
                    className="w-8 h-8 rounded-full object-cover"
                  />
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

        {/* Contests Section */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">Contests</h2>
            <button
              onClick={() => setShowNewContest(!showNewContest)}
              className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
            >
              + Add
            </button>
          </div>

          {showNewContest && (
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
              <input
                type="text"
                placeholder="Contest name"
                autoFocus
                value={newContestName}
                onChange={(e) => setNewContestName(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] mb-2"
              />
              <div className="flex gap-2 mb-2">
                <select
                  value={newContestType}
                  onChange={(e) => setNewContestType(e.target.value)}
                  className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
                  style={{ backgroundColor: "transparent" }}
                >
                  <option value="kgb_cup">KGB Cup</option>
                  <option value="scramble">Scramble</option>
                  <option value="cornhole_singles">Cornhole Singles</option>
                  <option value="cornhole_doubles">Cornhole Doubles</option>
                  <option value="calcutta">Calcutta</option>
                  <option value="other">Other</option>
                </select>
                <select
                  value={newContestDay}
                  onChange={(e) => setNewContestDay(e.target.value)}
                  className="w-24 border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
                  style={{ backgroundColor: "transparent" }}
                >
                  <option value="">No day</option>
                  <option value="1">Day 1</option>
                  <option value="2">Day 2</option>
                  <option value="3">Day 3</option>
                  <option value="4">Day 4</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={createContest}
                  disabled={!newContestName.trim() || saving === "new"}
                  className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                >
                  {saving === "new" ? "Creating..." : "Create"}
                </button>
                <button
                  onClick={() => setShowNewContest(false)}
                  className="px-4 text-sm text-gray-500"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div className="divide-y divide-gray-50">
            {contests.map((contest) => (
              <div
                key={contest.id}
                className="flex items-center px-4 py-3"
              >
                <button
                  onClick={() => openContestDetail(contest)}
                  className="flex-1 text-left"
                >
                  <div className="text-sm font-medium text-gray-900">
                    {contest.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {contest.participant_count} participant
                    {contest.participant_count !== 1 ? "s" : ""}
                    {contest.day_number ? ` · Day ${contest.day_number}` : ""}
                  </div>
                </button>
                <button
                  onClick={() => openContestDetail(contest)}
                  className="text-xs text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 mr-1"
                >
                  Manage
                </button>
                <button
                  onClick={() => deleteContest(contest.id)}
                  className="text-gray-300 hover:text-red-500 p-1"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
            {contests.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No contests yet
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Contest Detail View ──
  if (view === "contest-detail" && selectedContest) {
    const attendees = users.filter((u) => u.is_participating);

    return (
      <div>
        <button
          onClick={() => {
            setView("roster");
            setSelectedContest(null);
          }}
          className="flex items-center gap-1 text-green-700 text-sm font-medium mb-4"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Back to Roster
        </button>

        <h1 className="text-2xl font-bold text-gray-900 mb-1">
          {selectedContest.name}
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Select participants for this contest
        </p>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900">
              {contestParticipantIds.size} of {attendees.length} attendees
            </h2>
            <div className="flex gap-2">
              <button
                onClick={selectAllContestParticipants}
                disabled={saving !== null}
                className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
              >
                All
              </button>
              <button
                onClick={deselectAllContestParticipants}
                disabled={saving !== null}
                className="text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
              >
                None
              </button>
            </div>
          </div>
          <div className="divide-y divide-gray-50">
            {attendees.map((user) => {
              const inContest = contestParticipantIds.has(user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => toggleContestParticipant(user.id, inContest)}
                  disabled={saving !== null}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
                >
                  <div
                    className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      inContest
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {inContest && (
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
                  {user.avatar_url ? (
                    <img
                      src={user.avatar_url}
                      alt=""
                      className="w-8 h-8 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                      {(user.display_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900 flex-1">
                    {user.display_name || user.full_name || "Unknown"}
                  </span>
                  {saving === user.id && (
                    <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                  )}
                </button>
              );
            })}
            {attendees.length === 0 && (
              <div className="px-4 py-6 text-center text-sm text-gray-400">
                No attendees. Add participants to the event first.
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <ConfirmModal
      open={!!confirmModal}
      title={confirmModal?.title || ""}
      message={confirmModal?.message || ""}
      confirmLabel="Delete"
      destructive
      onConfirm={() => confirmModal?.onConfirm()}
      onCancel={() => setConfirmModal(null)}
    />
  );
}
