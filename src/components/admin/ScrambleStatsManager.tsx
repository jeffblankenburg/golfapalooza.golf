"use client";

import { useState, useEffect, useCallback } from "react";

interface UserStat {
  user_id: string;
  display_name: string;
  eight_bag_average: number | null;
  avg_scramble_score: number | null;
}

export function ScrambleStatsManager() {
  const [stats, setStats] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/scramble-stats");
      const data = await res.json();
      setStats(data.stats || []);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const saveStat = async (userId: string, field: "eight_bag_average" | "avg_scramble_score", value: string) => {
    const numValue = value.trim() === "" ? null : parseFloat(value);
    if (value.trim() !== "" && isNaN(numValue!)) return;

    setSaving(userId + field);
    try {
      const stat = stats.find((s) => s.user_id === userId);
      if (!stat) return;

      await fetch("/api/admin/scramble-stats", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          eight_bag_average: field === "eight_bag_average" ? numValue : stat.eight_bag_average,
          avg_scramble_score: field === "avg_scramble_score" ? numValue : stat.avg_scramble_score,
        }),
      });

      setStats((prev) =>
        prev.map((s) =>
          s.user_id === userId ? { ...s, [field]: numValue } : s
        )
      );
    } catch {
      // silently fail
    } finally {
      setSaving(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_5rem_5rem] gap-2 px-2 text-xs font-bold text-gray-500 uppercase tracking-wide">
        <span>Loozer</span>
        <span className="text-center">8 Bag Avg</span>
        <span className="text-center">Avg Scramble</span>
      </div>

      {stats.map((s) => (
        <div
          key={s.user_id}
          className="grid grid-cols-[1fr_5rem_5rem] gap-2 items-center px-2 py-1.5 rounded-lg hover:bg-gray-50"
        >
          <span className="text-sm font-medium text-gray-900 truncate">
            {s.display_name}
          </span>
          <input
            type="number"
            step="0.1"
            defaultValue={s.eight_bag_average ?? ""}
            onBlur={(e) => saveStat(s.user_id, "eight_bag_average", e.target.value)}
            className={`w-full text-center text-sm border rounded-lg px-1 py-1 ${
              saving === s.user_id + "eight_bag_average"
                ? "border-green-400 bg-green-50"
                : "border-gray-300"
            }`}
          />
          <input
            type="number"
            step="0.1"
            defaultValue={s.avg_scramble_score ?? ""}
            onBlur={(e) => saveStat(s.user_id, "avg_scramble_score", e.target.value)}
            className={`w-full text-center text-sm border rounded-lg px-1 py-1 ${
              saving === s.user_id + "avg_scramble_score"
                ? "border-green-400 bg-green-50"
                : "border-gray-300"
            }`}
          />
        </div>
      ))}
    </div>
  );
}
