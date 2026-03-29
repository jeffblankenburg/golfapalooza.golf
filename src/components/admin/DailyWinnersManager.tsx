"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface Participant {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Winner {
  id: string;
  day_number: number;
  contest_type: string;
  user_id: string;
}

const DAYS = [
  { day: 2, label: "Thursday" },
  { day: 3, label: "Friday" },
  { day: 4, label: "Saturday" },
];

const CONTEST_TYPES = [
  { type: "ctp", label: "Closest to Pin" },
  { type: "long_putt", label: "Long Putt" },
];

export function DailyWinnersManager({ tripId }: { tripId: string }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [winners, setWinners] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [showRealNames, setShowRealNames] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const winnerKey = (day: number, type: string) => `${day}-${type}`;

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/daily-winners?trip_id=${tripId}`);
    const data = await res.json();

    setParticipants(data.participants || []);

    const map: Record<string, string> = {};
    for (const w of (data.winners || []) as Winner[]) {
      map[winnerKey(w.day_number, w.contest_type)] = w.user_id;
    }
    setWinners(map);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const setWinner = async (day: number, contestType: string, userId: string) => {
    const key = winnerKey(day, contestType);
    setWinners((prev) => ({ ...prev, [key]: userId }));
    setSaving(key);

    try {
      await fetch("/api/admin/daily-winners", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          day_number: day,
          contest_type: contestType,
          user_id: userId,
        }),
      });
    } catch {
      // Revert on error
      setWinners((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
    setSaving(null);
  };

  const handleReset = async () => {
    try {
      const res = await fetch(`/api/admin/daily-winners?trip_id=${tripId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      setWinners({});
    } catch {
      // silent
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          Select winners for each day
        </p>
        <button
          onClick={() => setShowRealNames(!showRealNames)}
          className="text-xs text-gray-500 underline"
        >
          {showRealNames ? "Show nicknames" : "Show real names"}
        </button>
      </div>

      {DAYS.map((d) => (
        <div key={d.day} className="bg-white rounded-xl border border-gray-200 p-3 space-y-3">
          <p className="text-sm font-semibold text-gray-900">{d.label}</p>
          {CONTEST_TYPES.map((ct) => {
            const key = winnerKey(d.day, ct.type);
            const selectedUserId = winners[key] || "";
            const isSaving = saving === key;

            return (
              <div key={ct.type} className="flex items-center gap-3">
                <label className="text-xs text-gray-500 w-24 flex-shrink-0">
                  {ct.label}
                </label>
                <div className="relative flex-1">
                  <select
                    value={selectedUserId}
                    onChange={(e) => {
                      if (e.target.value) {
                        setWinner(d.day, ct.type, e.target.value);
                      }
                    }}
                    disabled={isSaving}
                    className="w-full text-sm border border-gray-200 rounded-lg py-1.5 px-2 bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none disabled:opacity-50 appearance-none"
                  >
                    <option value="">Select winner...</option>
                    {participants.map((p) => (
                      <option key={p.id} value={p.id}>
                        {showRealNames ? (p.full_name || p.display_name) : p.display_name}
                      </option>
                    ))}
                  </select>
                  <svg className="w-4 h-4 text-gray-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {/* Reset */}
      <button
        onClick={() =>
          setConfirmModal({
            title: "Reset Daily Winners",
            message: "This will clear all Closest to Pin and Long Putt winners across all three days. This cannot be undone.",
            onConfirm: handleReset,
          })
        }
        className="w-full py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
      >
        Reset All Winners
      </button>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        onConfirm={() => {
          confirmModal?.onConfirm();
          setConfirmModal(null);
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
