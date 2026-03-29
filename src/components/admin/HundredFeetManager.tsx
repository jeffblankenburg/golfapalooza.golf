"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface Participant {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Score {
  user_id: string;
  day_number: number;
  feet: number;
  inches: number;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

const DAYS = [
  { day: 2, label: "Thu" },
  { day: 3, label: "Fri" },
  { day: 4, label: "Sat" },
];

export function HundredFeetManager({ tripId }: { tripId: string }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showRealNames, setShowRealNames] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const dirtyRef = useRef<Map<string, Score>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scoreKey = (userId: string, day: number) => `${userId}-${day}`;

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/hundred-feet?trip_id=${tripId}`);
    const data = await res.json();

    setParticipants(data.participants || []);

    const scoreMap: Record<string, Score> = {};
    for (const s of data.scores || []) {
      scoreMap[scoreKey(s.user_id, s.day_number)] = {
        user_id: s.user_id,
        day_number: s.day_number,
        feet: s.feet,
        inches: s.inches,
      };
    }
    setScores(scoreMap);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const flush = useCallback(async () => {
    const dirty = Array.from(dirtyRef.current.values());
    if (dirty.length === 0) return;

    dirtyRef.current.clear();
    setSaveStatus("saving");

    try {
      const res = await fetch("/api/admin/hundred-feet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, scores: dirty }),
      });

      if (!res.ok) throw new Error("Save failed");

      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [tripId]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      // Flush on unmount
      const dirty = Array.from(dirtyRef.current.values());
      if (dirty.length > 0) {
        fetch("/api/admin/hundred-feet", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trip_id: tripId, scores: dirty }),
        });
      }
    };
  }, [tripId]);

  const updateScore = (userId: string, day: number, field: "feet" | "inches", value: number) => {
    const key = scoreKey(userId, day);
    const existing = scores[key];
    if (!existing) return; // Don't allow editing cells that haven't been filled
    const updated = { ...existing, [field]: value };

    setScores((prev) => ({ ...prev, [key]: updated }));
    dirtyRef.current.set(key, updated);

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flush, 500);
  };

  const fillDay = (day: number) => {
    const newScores: Record<string, Score> = { ...scores };
    for (const p of participants) {
      const key = scoreKey(p.id, day);
      if (newScores[key]) continue; // Already has a score
      const score: Score = { user_id: p.id, day_number: day, feet: 100, inches: 0 };
      newScores[key] = score;
      dirtyRef.current.set(key, score);
    }
    setScores(newScores);

    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flush, 500);
  };

  const isDayFilled = (day: number) => {
    return participants.every((p) => !!scores[scoreKey(p.id, day)]);
  };

  const handleReset = async () => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/admin/hundred-feet?trip_id=${tripId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Reset failed");
      dirtyRef.current.clear();
      setScores({});
      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
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
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <p className="text-xs text-gray-500">
            {participants.length} participant{participants.length !== 1 ? "s" : ""}
          </p>
          {saveStatus === "saving" && (
            <span className="text-xs text-gray-400">Saving...</span>
          )}
          {saveStatus === "saved" && (
            <span className="text-xs text-green-600">Saved</span>
          )}
          {saveStatus === "error" && (
            <span className="text-xs text-red-600">Error saving</span>
          )}
        </div>
        <button
          onClick={() => setShowRealNames(!showRealNames)}
          className="text-xs text-gray-500 underline"
        >
          {showRealNames ? "Show nicknames" : "Show real names"}
        </button>
      </div>

      {/* Header */}
      <div className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] gap-1 text-xs font-semibold text-gray-500 uppercase px-1">
        <div>Player</div>
        {DAYS.map((d) => {
          const filled = isDayFilled(d.day);
          return (
            <button
              key={d.day}
              onClick={() => !filled && fillDay(d.day)}
              disabled={filled}
              className={`text-center rounded py-1 transition-colors ${
                filled
                  ? "text-green-600 cursor-default"
                  : "text-blue-600 hover:bg-blue-50 active:bg-blue-100"
              }`}
              title={filled ? `${d.label} scores filled` : `Fill all ${d.label} with 100'0"`}
            >
              {d.label} {filled ? "✓" : "↓"}
            </button>
          );
        })}
      </div>

      {/* Rows */}
      {participants.map((p) => (
        <div
          key={p.id}
          className="grid grid-cols-[1fr_repeat(3,minmax(0,1fr))] gap-1 items-center bg-white rounded-xl border border-gray-200 px-2 py-2"
        >
          <div className="flex items-center gap-1.5 min-w-0">
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
            ) : (
              <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold flex-shrink-0">
                {(p.display_name || "?")[0].toUpperCase()}
              </span>
            )}
            <span className="text-xs font-medium text-gray-900 truncate">
              {showRealNames ? (p.full_name || p.display_name) : p.display_name}
            </span>
          </div>
          {DAYS.map((d) => {
            const key = scoreKey(p.id, d.day);
            const s = scores[key];
            if (!s) {
              return (
                <div key={d.day} className="flex items-center justify-center">
                  <span className="text-xs text-gray-300">—</span>
                </div>
              );
            }
            return (
              <div key={d.day} className="flex items-center gap-0.5 justify-center">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={s.feet}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                    updateScore(p.id, d.day, "feet", v);
                  }}
                  className="w-10 text-center text-xs border border-gray-200 rounded py-1 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                />
                <span className="text-[10px] text-gray-400">&apos;</span>
                <input
                  type="number"
                  min={0}
                  max={11}
                  value={s.inches}
                  onChange={(e) => {
                    const v = Math.max(0, Math.min(11, parseInt(e.target.value) || 0));
                    updateScore(p.id, d.day, "inches", v);
                  }}
                  className="w-8 text-center text-xs border border-gray-200 rounded py-1 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
                />
                <span className="text-[10px] text-gray-400">&quot;</span>
              </div>
            );
          })}
        </div>
      ))}

      {/* Reset */}
      <button
        onClick={() =>
          setConfirmModal({
            title: "Reset 100 Feet",
            message: "This will clear ALL 100-feet scores across all three days. This cannot be undone.",
            onConfirm: handleReset,
          })
        }
        className="w-full py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
      >
        Reset All Scores
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
