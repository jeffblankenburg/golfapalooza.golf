"use client";

import { useState, useEffect, useCallback } from "react";

interface TiedPlayer {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

export function BspitwPlayoff({ tripId, onResolved }: { tripId: string; onResolved?: () => void }) {
  const [prizeId, setPrizeId] = useState<string | null>(null);
  const [tiedPlayers, setTiedPlayers] = useState<TiedPlayer[]>([]);
  const [tiedPoints, setTiedPoints] = useState<number | null>(null);
  const [winnerId, setWinnerId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const checkTieState = useCallback(async () => {
    try {
      // Fetch leaderboard and calcutta contest in parallel
      const [lbRes, contestsRes] = await Promise.all([
        fetch(`/api/bspitw?trip_id=${tripId}`),
        fetch(`/api/admin/contests?trip_id=${tripId}`),
      ]);
      const [lbData, contestsData] = await Promise.all([lbRes.json(), contestsRes.json()]);

      // Check for tie in leaderboard
      const lb = lbData.leaderboard || [];
      if (lb.length < 2) return;

      const topPoints = lb[0].total_points;
      const topPlayers = lb.filter((p: { total_points: number }) => p.total_points === topPoints);
      if (topPlayers.length < 2) return;

      // Find calcutta contest and BSPITW prize
      const calcutta = (contestsData.contests || []).find(
        (c: { contest_type: string }) => c.contest_type === "calcutta"
      );
      if (!calcutta) return;

      const winnersRes = await fetch(`/api/admin/contest-winners?contest_id=${calcutta.id}`);
      const winnersData = await winnersRes.json();
      const bspitwPrize = (winnersData.prizes || []).find(
        (p: { resolution_type: string | null; linked_contest: { contest_type: string } | { contest_type: string }[] | null }) => {
          if (p.resolution_type === "bspitw") return true;
          const lc = Array.isArray(p.linked_contest) ? p.linked_contest[0] : p.linked_contest;
          return lc?.contest_type === "other";
        }
      );
      if (!bspitwPrize) return;

      setPrizeId(bspitwPrize.id);
      setTiedPoints(topPoints);
      setTiedPlayers(topPlayers.map((p: { user_id: string; display_name: string; avatar_url: string | null }) => ({
        id: p.user_id,
        display_name: p.display_name,
        avatar_url: p.avatar_url,
      })));

      if (bspitwPrize.winners && bspitwPrize.winners.length > 0) {
        setWinnerId(bspitwPrize.winners[0].user_id);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    checkTieState();
  }, [checkTieState]);

  const handleSelect = async (userId: string) => {
    if (!prizeId) return;
    setSaving(true);
    try {
      await fetch("/api/admin/contest-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prize_id: prizeId,
          action: "manual",
          winner_user_ids: [userId],
          notes: "Won playoff",
        }),
      });
      setWinnerId(userId);
      onResolved?.();
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (tiedPlayers.length === 0) {
    return <p className="text-sm text-gray-500">No BSPITW tie to resolve.</p>;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-amber-700">
        Tied at {tiedPoints} points. Tap the playoff winner.
      </p>
      <div className="flex flex-wrap gap-2">
        {tiedPlayers.map((u) => {
          const isSelected = winnerId === u.id;
          return (
            <button
              key={u.id}
              disabled={saving}
              onClick={() => handleSelect(u.id)}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 ${
                isSelected
                  ? "bg-amber-600 text-white shadow-md ring-2 ring-amber-400"
                  : "bg-white text-gray-900 border border-gray-200 hover:border-amber-300 hover:bg-amber-50"
              }`}
            >
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
              ) : (
                <span className="w-6 h-6 rounded-full bg-amber-200 flex items-center justify-center text-xs font-bold text-amber-800">
                  {(u.display_name || "?")[0].toUpperCase()}
                </span>
              )}
              {u.display_name}
              {isSelected && (
                <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
