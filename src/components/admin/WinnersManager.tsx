"use client";

import { useState, useEffect, useCallback } from "react";

interface Winner {
  user_id: string;
  is_playoff: boolean;
  notes: string | null;
  user: { id: string; display_name: string; avatar_url: string | null } | null;
}

interface LinkedContest {
  id: string;
  name: string;
  contest_type: string;
  verified_at: string | null;
  winners_locked_at: string | null;
}

interface Prize {
  id: string;
  prize_name: string | null;
  place: number;
  percentage: number;
  per_player: boolean;
  player_count: number;
  resolution_type: string | null;
  linked_contest_id: string | null;
  linked_contest: LinkedContest | LinkedContest[] | null;
  winners: Winner[];
  total_payout: number;
}

interface Props {
  contestId: string | null;
}

export function WinnersManager({ contestId }: Props) {
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [pool, setPool] = useState(0);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [tieInfo, setTieInfo] = useState<{ prizeId: string; tiedUserIds: string[]; tiedPoints?: number } | null>(null);
  const [tieUsers, setTieUsers] = useState<{ id: string; display_name: string }[]>([]);
  const [selectedTieWinner, setSelectedTieWinner] = useState<string>("");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmClearId, setConfirmClearId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!contestId) return;
    try {
      const res = await fetch(`/api/admin/contest-winners?contest_id=${contestId}`);
      const data = await res.json();
      setPrizes(data.prizes || []);
      setPool(data.pool || 0);
    } catch (err) {
      console.error("Failed to fetch winners:", err);
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // When tie info is set, fetch user names
  useEffect(() => {
    if (!tieInfo) {
      setTieUsers([]);
      return;
    }
    const fetchTieUsers = async () => {
      const res = await fetch(`/api/admin/users`);
      const data = await res.json();
      const users = (data.users || [])
        .filter((u: { id: string }) => tieInfo.tiedUserIds.includes(u.id))
        .map((u: { id: string; display_name: string }) => ({ id: u.id, display_name: u.display_name }));
      setTieUsers(users);
    };
    fetchTieUsers();
  }, [tieInfo]);

  const handleAutoResolve = async (prizeId: string) => {
    setActionLoading(prizeId);
    setTieInfo(null);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/contest-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prize_id: prizeId, action: "auto" }),
      });
      const data = await res.json();

      if (res.status === 409 && data.tied) {
        setTieInfo({ prizeId, tiedUserIds: data.tiedUserIds, tiedPoints: data.tiedPoints });
      } else if (!res.ok) {
        setErrorMsg(data.error || "Failed to resolve");
      }

      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleManualResolve = async (prizeId: string, userIds: string[], notes?: string) => {
    setActionLoading(prizeId);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/contest-winners", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prize_id: prizeId, action: "manual", winner_user_ids: userIds, notes }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.error || "Failed to set winner");
      }
      setTieInfo(null);
      setSelectedTieWinner("");
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleClear = async (prizeId: string) => {
    setConfirmClearId(null);
    setActionLoading(prizeId);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/admin/contest-winners", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prize_id: prizeId }),
      });
      if (!res.ok) {
        const data = await res.json();
        setErrorMsg(data.error || "Failed to clear");
      }
      await fetchData();
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleLockToggle = async (contestIdToLock: string, currentlyLocked: boolean) => {
    try {
      await fetch("/api/admin/contest-winners/lock", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: contestIdToLock, action: currentlyLocked ? "unlock" : "lock" }),
      });
      await fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const getLinkedContest = (prize: Prize): LinkedContest | null => {
    if (!prize.linked_contest) return null;
    return Array.isArray(prize.linked_contest) ? prize.linked_contest[0] : prize.linked_contest;
  };

  const getPrizeName = (prize: Prize): string => {
    const lc = getLinkedContest(prize);
    return lc?.name || prize.prize_name || "Prize";
  };

  if (!contestId) {
    return <p className="text-sm text-gray-500">No calcutta contest found.</p>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (prizes.length === 0) {
    return <p className="text-sm text-gray-500">No prizes configured yet.</p>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-600">
          Pool: <span className="font-semibold text-gray-900">${pool.toFixed(2)}</span>
        </p>
      </div>

      {/* Inline error message */}
      {errorMsg && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-xs text-red-700 flex-1">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className="text-red-400 hover:text-red-600">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {prizes.map((prize) => {
        const lc = getLinkedContest(prize);
        const hasWinners = prize.winners.length > 0;
        const isLocked = !!lc?.winners_locked_at;
        const isLoading = actionLoading === prize.id;
        const isTied = tieInfo?.prizeId === prize.id;

        return (
          <div
            key={prize.id}
            className={`rounded-lg border p-3 ${
              hasWinners
                ? "border-emerald-200 bg-emerald-50"
                : "border-gray-200 bg-white"
            }`}
          >
            {/* Prize header */}
            <div className="flex items-center justify-between mb-2">
              <div>
                <h4 className="text-sm font-semibold text-gray-900">
                  {getPrizeName(prize)}
                  {prize.place > 1 && ` — ${ordinal(prize.place)} Place`}
                </h4>
                <p className="text-xs text-gray-500">
                  {prize.percentage}% of pool = ${prize.total_payout.toFixed(2)}
                  {prize.per_player && ` (per player x${prize.player_count})`}
                </p>
              </div>

              {/* Status badges */}
              <div className="flex items-center gap-1.5">
                {hasWinners && (
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Resolved
                  </span>
                )}
                {isLocked && (
                  <button
                    onClick={() => handleLockToggle(lc!.id, true)}
                    className="text-xs font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full hover:bg-amber-200"
                    title="Click to unlock"
                  >
                    Locked
                  </button>
                )}
                {lc && !isLocked && hasWinners && (
                  <button
                    onClick={() => handleLockToggle(lc.id, false)}
                    className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full hover:bg-gray-200"
                    title="Click to lock"
                  >
                    Unlocked
                  </button>
                )}
              </div>
            </div>

            {/* Winners list */}
            {hasWinners && (
              <div className="mb-2 space-y-1">
                {prize.winners.map((w) => {
                  const wu = Array.isArray(w.user) ? w.user[0] : w.user;
                  return (
                    <div key={w.user_id} className="flex items-center gap-2 text-sm">
                      {wu?.avatar_url ? (
                        <img src={wu.avatar_url} alt="" className="w-5 h-5 rounded-full" />
                      ) : (
                        <div className="w-5 h-5 rounded-full bg-gray-200" />
                      )}
                      <span className="text-gray-900">{wu?.display_name || "Unknown"}</span>
                      {w.is_playoff && (
                        <span className="text-xs text-purple-600">(playoff)</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Tie resolution UI */}
            {isTied && (
              <div className="mb-2 p-2 rounded bg-amber-50 border border-amber-200">
                <p className="text-xs font-medium text-amber-800 mb-2">
                  Tie detected{tieInfo.tiedPoints != null && ` at ${tieInfo.tiedPoints} points`} — declare playoff winner:
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={selectedTieWinner}
                    onChange={(e) => setSelectedTieWinner(e.target.value)}
                    className="text-sm rounded border-gray-300 flex-1"
                  >
                    <option value="">Select winner...</option>
                    {tieUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.display_name}
                      </option>
                    ))}
                  </select>
                  <button
                    disabled={!selectedTieWinner || isLoading}
                    onClick={() => handleManualResolve(prize.id, [selectedTieWinner], "Won playoff")}
                    className="text-xs font-medium text-white bg-purple-600 px-3 py-1.5 rounded hover:bg-purple-700 disabled:opacity-50"
                  >
                    Declare Winner
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2">
              {!hasWinners && (
                <button
                  disabled={isLoading}
                  onClick={() => handleAutoResolve(prize.id)}
                  className="text-xs font-medium text-white bg-green-600 px-3 py-1.5 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {isLoading ? "Resolving..." : "Auto-Resolve"}
                </button>
              )}
              {hasWinners && confirmClearId !== prize.id && (
                <button
                  disabled={isLoading}
                  onClick={() => setConfirmClearId(prize.id)}
                  className="text-xs font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded hover:bg-red-100 disabled:opacity-50"
                >
                  Clear Winners
                </button>
              )}
              {confirmClearId === prize.id && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-red-600">Clear winners and unlock?</span>
                  <button
                    onClick={() => handleClear(prize.id)}
                    className="text-xs font-medium text-white bg-red-600 px-2.5 py-1 rounded hover:bg-red-700"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirmClearId(null)}
                    className="text-xs font-medium text-gray-600 bg-gray-100 px-2.5 py-1 rounded hover:bg-gray-200"
                  >
                    No
                  </button>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
