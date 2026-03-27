"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { ContestTeeAssigner } from "@/components/admin/ContestTeeAssigner";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface UserWithStatus {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  is_participating: boolean;
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
}

export function ContestManager({ tripId }: { tripId: string }) {
  const [users, setUsers] = useState<UserWithStatus[]>([]);
  const [contests, setContests] = useState<Contest[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [contestParticipantIds, setContestParticipantIds] = useState<Set<string>>(new Set());
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

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`/api/admin/participants?trip_id=${tripId}`);
    const data = await res.json();
    if (data.users) setUsers(data.users);
  }, [tripId]);

  const fetchContests = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    if (data.contests) setContests(data.contests);
  }, [tripId]);

  const fetchContestParticipants = useCallback(async (contestId: string) => {
    const res = await fetch(`/api/admin/contests/participants?contest_id=${contestId}`);
    const data = await res.json();
    if (data.participants) {
      const ids = new Set<string>(data.participants.map((p: ContestParticipant) => p.user_id));
      setContestParticipantIds(ids);
    }
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchContests()]);
      setLoading(false);
    }
    init();
  }, [fetchUsers, fetchContests]);

  const toggleContestParticipant = async (userId: string, inContest: boolean) => {
    if (!selectedContest) return;

    // Optimistic update
    setContestParticipantIds((prev) => {
      const next = new Set(prev);
      if (inContest) next.delete(userId);
      else next.add(userId);
      return next;
    });
    setContests((prev) =>
      prev.map((c) =>
        c.id === selectedContest.id
          ? { ...c, participant_count: c.participant_count + (inContest ? -1 : 1) }
          : c
      )
    );

    const method = inContest ? "DELETE" : "POST";
    const res = await fetch("/api/admin/contests/participants", {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, user_id: userId }),
    });

    if (!res.ok) {
      // Revert
      setContestParticipantIds((prev) => {
        const next = new Set(prev);
        if (inContest) next.add(userId);
        else next.delete(userId);
        return next;
      });
      setContests((prev) =>
        prev.map((c) =>
          c.id === selectedContest.id
            ? { ...c, participant_count: c.participant_count + (inContest ? 1 : -1) }
            : c
        )
      );
    }
  };

  const selectAllContestParticipants = async () => {
    if (!selectedContest) return;
    setSaving("all");

    const attendeeIds = users.filter((u) => u.is_participating).map((u) => u.id);

    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, user_ids: attendeeIds }),
    });

    await Promise.all([fetchContestParticipants(selectedContest.id), fetchContests()]);
    setSaving(null);
  };

  const deselectAllContestParticipants = async () => {
    if (!selectedContest) return;
    setSaving("all");

    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, user_ids: [] }),
    });

    await Promise.all([fetchContestParticipants(selectedContest.id), fetchContests()]);
    setSaving(null);
  };

  const openDrawer = async (contest: Contest) => {
    setSelectedContest(contest);
    await fetchContestParticipants(contest.id);
    setDrawerOpen(true);
  };

  const closeDrawer = () => {
    setDrawerOpen(false);
    setTimeout(() => setSelectedContest(null), 200);
  };

  const createContest = async () => {
    if (!newContestName.trim()) return;
    setSaving("new");

    await fetch("/api/admin/contests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        name: newContestName.trim(),
        contest_type: newContestType,
        day_number: newContestDay ? parseInt(newContestDay) : null,
        sort_order: contests.length + 1,
      }),
    });

    await fetchContests();
    setNewContestName("");
    setNewContestType("other");
    setNewContestDay("");
    setShowNewContest(false);
    setSaving(null);
  };

  const updateContest = async (contest: Contest, updates: Partial<Pick<Contest, "name" | "contest_type" | "day_number">>) => {
    const updated = { ...contest, ...updates };

    // Optimistic update
    setSelectedContest(updated);
    setContests((prev) => prev.map((c) => (c.id === contest.id ? { ...updated } : c)));

    await fetch("/api/admin/contests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: contest.id,
        name: updated.name,
        contest_type: updated.contest_type,
        day_number: updated.day_number,
        sort_order: updated.sort_order,
      }),
    });
  };

  const deleteContest = (contestId: string) => {
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
        await fetchContests();
      },
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const attendees = users.filter((u) => u.is_participating);

  const drawerSubtitle = selectedContest
    ? `${contestParticipantIds.size} of ${attendees.length} attendees${selectedContest.day_number ? ` · Day ${selectedContest.day_number}` : ""}`
    : undefined;

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          onClick={() => setShowNewContest(!showNewContest)}
          className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
        >
          + Add
        </button>
      </div>

      {showNewContest && (
        <div className="px-4 py-3 mb-3 rounded-xl bg-gray-50 border border-gray-200">
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

      <div className="divide-y divide-gray-50 -mx-4">
        {contests.map((contest) => (
          <div key={contest.id} className="flex items-center px-4 py-3">
            <button onClick={() => openDrawer(contest)} className="flex-1 text-left">
              <div className="text-sm font-medium text-gray-900">{contest.name}</div>
              <div className="text-xs text-gray-500">
                {contest.participant_count} participant{contest.participant_count !== 1 ? "s" : ""}
                {contest.day_number ? ` · Day ${contest.day_number}` : ""}
              </div>
            </button>
            <button
              onClick={() => openDrawer(contest)}
              className="text-xs text-green-700 font-medium px-3 py-1.5 rounded-lg hover:bg-green-50 mr-1"
            >
              Manage
            </button>
            <button
              onClick={() => deleteContest(contest.id)}
              className="text-gray-300 hover:text-red-500 p-1"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        ))}
        {contests.length === 0 && (
          <div className="px-4 py-6 text-center text-sm text-gray-400">No contests yet</div>
        )}
      </div>

      <BottomDrawer
        open={drawerOpen}
        onClose={closeDrawer}
        title={selectedContest?.name || ""}
        subtitle={drawerSubtitle}
      >
        {selectedContest && (
          <div>
            {/* Settings */}
            <div className="px-4 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Settings
              </span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <input
                type="text"
                value={selectedContest.name}
                onChange={(e) => {
                  const name = e.target.value;
                  setSelectedContest((prev) => prev ? { ...prev, name } : prev);
                  setContests((prev) => prev.map((c) => c.id === selectedContest.id ? { ...c, name } : c));
                }}
                onBlur={() => updateContest(selectedContest, { name: selectedContest.name })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px]"
              />
              <div className="flex gap-2">
                <select
                  value={selectedContest.contest_type}
                  onChange={(e) => updateContest(selectedContest, { contest_type: e.target.value })}
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
                  value={selectedContest.day_number ?? ""}
                  onChange={(e) => updateContest(selectedContest, { day_number: e.target.value ? parseInt(e.target.value) : null })}
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
            </div>

            {/* Participants */}
            <div className="px-4 py-2 bg-gray-50">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Participants
              </span>
            </div>
            <div className="flex gap-2 px-4 py-2">
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
                        inContest ? "bg-green-600 border-green-600" : "border-gray-300"
                      }`}
                    >
                      {inContest && (
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
                    {saving === user.id && (
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                    )}
                  </button>
                );
              })}
              {attendees.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  No attendees. Add participants to the event roster first.
                </div>
              )}
            </div>

            {/* Tee Assignments */}
            {(selectedContest.contest_type === "kgb_cup" ||
              selectedContest.contest_type === "scramble") && (
              <>
                <div className="px-4 py-2 bg-gray-50 mt-1">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tee Assignments
                  </span>
                </div>
                <div className="px-4 py-3">
                  <ContestTeeAssigner contestId={selectedContest.id} />
                </div>
              </>
            )}
          </div>
        )}
      </BottomDrawer>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
