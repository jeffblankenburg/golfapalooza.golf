"use client";

import { useState, useEffect, useCallback } from "react";
import { ContestTeeAssigner } from "@/components/admin/ContestTeeAssigner";

interface EventDay {
  id: string;
  day_number: number;
  name: string;
}

export function ContestSetup({
  contestId,
  contestType,
  tripId,
}: {
  contestId: string | null;
  contestType: string;
  tripId: string;
}) {
  const [eventDays, setEventDays] = useState<EventDay[]>([]);
  const [dayNumber, setDayNumber] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const hasTees = contestType === "ryder_cup" || contestType === "scramble";

  const fetchEventDays = useCallback(async () => {
    const res = await fetch(`/api/admin/event-days?trip_id=${tripId}`);
    const data = await res.json();
    if (data.days) setEventDays(data.days);
  }, [tripId]);

  const fetchContest = useCallback(async () => {
    if (!contestId) return;
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const contest = (data.contests || []).find((c: { id: string }) => c.id === contestId);
    if (contest) setDayNumber(contest.day_number);
  }, [contestId, tripId]);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await Promise.all([fetchEventDays(), fetchContest()]);
      setLoading(false);
    }
    init();
  }, [fetchEventDays, fetchContest]);

  useEffect(() => {
    const handler = () => fetchEventDays();
    window.addEventListener("event-days-changed", handler);
    return () => window.removeEventListener("event-days-changed", handler);
  }, [fetchEventDays]);

  const updateDay = async (newDay: number | null) => {
    if (!contestId) return;
    setDayNumber(newDay);
    await fetch("/api/admin/contests", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: contestId, day_number: newDay }),
    });
    window.dispatchEvent(new CustomEvent("contests-changed"));
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

  return (
    <div className="space-y-4">
      {/* Day selector */}
      <div>
        <label className="text-xs text-gray-500 block mb-1">Event Day</label>
        <select
          value={dayNumber ?? ""}
          onChange={(e) => updateDay(e.target.value ? parseInt(e.target.value) : null)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-full"
          style={{ backgroundColor: "transparent" }}
        >
          <option value="">No day assigned</option>
          {eventDays.map((day) => (
            <option key={day.day_number} value={day.day_number}>
              Day {day.day_number} — {day.name}
            </option>
          ))}
        </select>
      </div>

      {/* Tee assignments (only for golf contests) */}
      {hasTees && <ContestTeeAssigner contestId={contestId} />}
    </div>
  );
}
