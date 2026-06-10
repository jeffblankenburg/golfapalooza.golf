"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface Contest {
  id: string;
  trip_id: string;
  name: string;
  contest_type: string;
  day_number: number | null;
  sort_order: number;
  participant_count: number;
}

interface EventDay {
  id: string;
  day_number: number;
  name: string;
}

// Single source of truth for contest_type options shown in both the
// "new contest" form and the edit drawer. Order matters — first entry
// is the default, so it's the most generic ("other") to avoid
// accidentally tagging a new contest as "Ryder Cup."
const CONTEST_TYPE_OPTIONS: Array<[string, string]> = [
  ["other", "Other"],
  ["ryder_cup", "Ryder Cup"],
  ["scramble", "Scramble"],
  ["scramble_skins", "Skins (scramble side game)"],
  ["ctp_front", "Closest to Pin — Front"],
  ["ctp_back", "Closest to Pin — Back"],
  ["long_drive", "Long Drive"],
  ["long_putt", "Long Putt"],
  ["cornhole_singles", "Cornhole Singles"],
  ["cornhole_doubles", "Cornhole Doubles"],
  ["calcutta", "Calcutta"],
  ["pickem", "Pick'em"],
];

export function ContestManager({ tripId }: { tripId: string }) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [eventDays, setEventDays] = useState<EventDay[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
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

  const fetchContests = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    if (data.contests) setContests(data.contests.filter((c: Contest) => c.contest_type !== "pickem"));
  }, [tripId]);

  const fetchEventDays = useCallback(async () => {
    const res = await fetch(`/api/admin/event-days?trip_id=${tripId}`);
    const data = await res.json();
    if (data.days) setEventDays(data.days);
  }, [tripId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchContests(), fetchEventDays()]);
      setLoading(false);
    }
    init();
  }, [fetchContests, fetchEventDays]);

  // Listen for event days changes from EventDaysManager
  useEffect(() => {
    const handler = () => fetchEventDays();
    window.addEventListener("event-days-changed", handler);
    return () => window.removeEventListener("event-days-changed", handler);
  }, [fetchEventDays]);

  const openDrawer = (contest: Contest) => {
    setSelectedContest(contest);
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
    window.dispatchEvent(new CustomEvent("contests-changed"));
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

    // Notify parent if contest type changed (affects which sections are shown)
    if (updates.contest_type && updates.contest_type !== contest.contest_type) {
      window.dispatchEvent(new CustomEvent("contests-changed"));
    }
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
        window.dispatchEvent(new CustomEvent("contests-changed"));
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
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base mb-2"
          />
          <div className="flex gap-2 mb-2">
            <select
              value={newContestType}
              onChange={(e) => setNewContestType(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-base"
              style={{ backgroundColor: "transparent" }}
            >
              {CONTEST_TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <select
              value={newContestDay}
              onChange={(e) => setNewContestDay(e.target.value)}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-base"
              style={{ backgroundColor: "transparent" }}
            >
              <option value="">No day</option>
              {eventDays.map((day) => (
                <option key={day.day_number} value={day.day_number}>
                  Day {day.day_number} - {day.name}
                </option>
              ))}
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
        subtitle="Edit contest"
      >
        {selectedContest && (
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
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
            />
            <select
              value={selectedContest.contest_type}
              onChange={(e) => updateContest(selectedContest, { contest_type: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base"
              style={{ backgroundColor: "transparent" }}
            >
              {CONTEST_TYPE_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            <p className="text-xs text-gray-400">
              Day, participants, and tees are managed on each contest&apos;s dedicated page.
            </p>
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
