"use client";

import { useState, useEffect, useCallback } from "react";

interface PlayerHandicap {
  user_id: string;
  display_name: string;
  full_name: string | null;
  live_handicap: number | null;
  locked_handicap: number | null;
  locked_at: string | null;
  is_locked: boolean;
}

export function HandicapManager({ tripId }: { tripId: string }) {
  const [players, setPlayers] = useState<PlayerHandicap[]>([]);
  const [loading, setLoading] = useState(true);
  const [locking, setLocking] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/handicaps?trip_id=${tripId}`);
    const data = await res.json();
    setPlayers(data.players || []);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isLocked = players.some((p) => p.is_locked);
  const lockedAt = players.find((p) => p.locked_at)?.locked_at;

  const lockAll = async () => {
    setLocking(true);
    await fetch("/api/admin/handicaps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId }),
    });
    await fetchData();
    setLocking(false);
  };

  const unlockAll = async () => {
    setLocking(true);
    await fetch("/api/admin/handicaps", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId }),
    });
    await fetchData();
    setLocking(false);
  };

  const saveOverride = async (userId: string) => {
    const val = parseFloat(editValue);
    if (isNaN(val)) return;
    await fetch("/api/admin/handicaps", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        user_id: userId,
        handicap_index: val,
      }),
    });
    setEditingId(null);
    await fetchData();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const sorted = [...players].sort((a, b) =>
    a.display_name.localeCompare(b.display_name)
  );

  return (
    <div className="space-y-4">
      {/* Status & Action */}
      <div className="flex items-center justify-between">
        <div>
          {isLocked ? (
            <div>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                Locked
              </span>
              {lockedAt && (
                <p className="text-xs text-gray-400 mt-0.5">
                  {new Date(lockedAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </p>
              )}
            </div>
          ) : (
            <span className="text-sm text-gray-500">Not locked</span>
          )}
        </div>
        <div className="flex gap-2">
          {isLocked && (
            <button
              onClick={lockAll}
              disabled={locking}
              className="px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg active:bg-amber-100 disabled:opacity-50"
            >
              Re-lock
            </button>
          )}
          <button
            onClick={isLocked ? unlockAll : lockAll}
            disabled={locking}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg disabled:opacity-50 ${
              isLocked
                ? "text-gray-700 bg-gray-100 border border-gray-200 active:bg-gray-200"
                : "text-white bg-green-600 active:bg-green-700"
            }`}
          >
            {locking ? "..." : isLocked ? "Unlock" : "Lock Handicaps"}
          </button>
        </div>
      </div>

      {/* Player List */}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <th className="text-left px-3 py-2 font-medium">Player</th>
              <th className="text-right px-3 py-2 font-medium">Live</th>
              <th className="text-right px-3 py-2 font-medium">Locked</th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((p) => (
              <tr key={p.user_id} className="hover:bg-gray-50">
                <td className="px-3 py-2 font-medium text-gray-900">
                  {p.display_name}
                </td>
                <td className="px-3 py-2 text-right text-gray-600 tabular-nums">
                  {p.live_handicap != null ? p.live_handicap.toFixed(1) : "—"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {editingId === p.user_id ? (
                    <div className="flex items-center justify-end gap-1">
                      <input
                        type="number"
                        step="0.1"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveOverride(p.user_id);
                          if (e.key === "Escape") setEditingId(null);
                        }}
                        autoFocus
                        className="w-16 text-right border border-gray-300 rounded px-1.5 py-0.5 text-sm"
                      />
                      <button
                        onClick={() => saveOverride(p.user_id)}
                        className="text-green-600 font-medium text-xs"
                      >
                        Save
                      </button>
                    </div>
                  ) : p.is_locked ? (
                    <span
                      className={`font-medium ${
                        p.locked_handicap !== p.live_handicap
                          ? "text-amber-700"
                          : "text-gray-900"
                      }`}
                    >
                      {p.locked_handicap != null
                        ? p.locked_handicap.toFixed(1)
                        : "—"}
                    </span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="px-1 py-2 text-center">
                  {isLocked && editingId !== p.user_id && (
                    <button
                      onClick={() => {
                        setEditingId(p.user_id);
                        setEditValue(
                          p.locked_handicap != null
                            ? p.locked_handicap.toString()
                            : p.live_handicap != null
                            ? p.live_handicap.toString()
                            : "0"
                        );
                      }}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {players.length === 0 && (
        <p className="text-center text-gray-400 text-sm py-4">
          No participants found. Add players to the roster first.
        </p>
      )}
    </div>
  );
}
