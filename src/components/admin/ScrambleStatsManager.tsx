"use client";

import { useState, useEffect, useCallback } from "react";

interface UserStat {
  user_id: string;
  display_name: string;
  eight_bag_average: number | null;
  avg_scramble_score: number | null;
}

export function ScrambleStatsManager({ tripId }: { tripId: string }) {
  const [stats, setStats] = useState<UserStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  const fetchStats = useCallback(async () => {
    try {
      const [statsRes, usersRes] = await Promise.all([
        fetch(`/api/admin/scramble-stats?trip_id=${tripId}`),
        fetch(`/api/admin/users`),
      ]);
      const statsData = await statsRes.json();
      const usersData = await usersRes.json();

      const users: { id: string; display_name: string }[] = usersData.users || [];
      const existingStats = statsData.stats || [];
      const statsMap = new Map(
        existingStats.map((s: { user_id: string; eight_bag_average: number | null; avg_scramble_score: number | null }) => [s.user_id, s])
      );

      const merged: UserStat[] = users
        .sort((a, b) => a.display_name.localeCompare(b.display_name))
        .map((u) => {
          const existing = statsMap.get(u.id) as { eight_bag_average: number | null; avg_scramble_score: number | null } | undefined;
          return {
            user_id: u.id,
            display_name: u.display_name,
            eight_bag_average: existing?.eight_bag_average ?? null,
            avg_scramble_score: existing?.avg_scramble_score ?? null,
          };
        });

      setStats(merged);
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [tripId]);

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
          trip_id: tripId,
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
