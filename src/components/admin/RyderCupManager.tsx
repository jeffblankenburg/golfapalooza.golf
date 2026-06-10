"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";
import { BTN_NEUTRAL } from "@/lib/ui/buttons";

// ── Types ──

interface PlayerInfo {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Pair {
  id: string;
  team_id: string;
  sort_order: number;
  player_a: PlayerInfo | null;
  player_b: PlayerInfo | null;
  player_c: PlayerInfo | null;
}

type PairSlotKey = "player_a_id" | "player_b_id" | "player_c_id";

const slotField = (slot: PairSlotKey): "player_a" | "player_b" | "player_c" =>
  (slot === "player_a_id" ? "player_a" : slot === "player_b_id" ? "player_b" : "player_c");

interface Team {
  id: string;
  contest_id: string;
  team_number: number;
  team_name: string | null;
  team_color: string | null;
  pairs: Pair[];
}

interface UnassignedPlayer {
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Contest {
  id: string;
  name: string;
  day_number: number | null;
}

// ── Component ──

export function RyderCupManager({ tripId }: { tripId: string }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Fetch contest
  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const ryderCup = (data.contests || []).find(
      (c: { contest_type: string }) => c.contest_type === "ryder_cup"
    );
    return ryderCup || null;
  }, [tripId]);

  // Fetch full state
  const fetchState = useCallback(async (contestId: string) => {
    const res = await fetch(`/api/admin/ryder-cup?contest_id=${contestId}`);
    const data = await res.json();
    setTeams(data.teams || []);
    setUnassigned(data.unassigned || []);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const c = await fetchContest();
      setContest(c);
      if (c) await fetchState(c.id);
      setLoading(false);
    }
    init();
  }, [fetchContest, fetchState]);

  const refresh = async () => {
    if (contest) await fetchState(contest.id);
  };

  // ── Team name editing ──

  const updateTeamName = async (teamId: string, teamName: string) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, team_name: teamName } : t))
    );

    await fetch("/api/admin/ryder-cup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, team_name: teamName }),
    });
  };

  const updateTeamColor = async (teamId: string, color: string | null) => {
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, team_color: color } : t))
    );

    await fetch("/api/admin/ryder-cup", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, team_color: color }),
    });
  };

  // ── Pair CRUD ──

  const createPair = async (teamId: string) => {
    setSaving(`new-pair-${teamId}`);
    const res = await fetch("/api/admin/ryder-cup/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId }),
    });
    if (res.ok) await refresh();
    setSaving(null);
  };

  const assignPlayer = async (
    pairId: string,
    slot: PairSlotKey,
    userId: string | null
  ) => {
    setSaving(`assign-${pairId}-${slot}`);
    setErrorMsg(null);
    const res = await fetch("/api/admin/ryder-cup/pairs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_id: pairId, [slot]: userId }),
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMsg(data.error || "Failed to assign player");
    }
    await refresh();
    setSaving(null);
  };

  const deletePair = (pairId: string) => {
    // Find the pair to check if it has players that need to be returned to pool
    const pair = teams.flatMap((t) => t.pairs).find((p) => p.id === pairId);
    const hasPlayers = pair && (pair.player_a || pair.player_b || pair.player_c);

    setConfirmModal({
      title: "Delete Pair",
      message: hasPlayers
        ? "Players in this pair will be returned to the unplaced pool."
        : "Delete this empty pair?",
      onConfirm: async () => {
        setConfirmModal(null);
        setErrorMsg(null);

        if (pair) {
          // Return players to pool before deleting
          for (const [player, slot] of [
            [pair.player_a, "player_a_id"] as const,
            [pair.player_b, "player_b_id"] as const,
            [pair.player_c, "player_c_id"] as const,
          ]) {
            if (!player) continue;
            // Clear slot first
            await fetch("/api/admin/ryder-cup/pairs", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ pair_id: pairId, [slot]: null }),
            });
            // Create pool pair for the player
            const res = await fetch("/api/admin/ryder-cup/pairs", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ team_id: pair.team_id, sort_order: 0 }),
            });
            if (res.ok) {
              const data = await res.json();
              await fetch("/api/admin/ryder-cup/pairs", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ pair_id: data.pair.id, player_a_id: player.id }),
              });
            }
          }
        }

        const res = await fetch("/api/admin/ryder-cup/pairs", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pair_id: pairId }),
        });
        if (!res.ok) {
          const data = await res.json();
          setErrorMsg(data.error || "Failed to delete pair");
        }
        await refresh();
      },
    });
  };

  // ── Add Players Drawer ──

  const [drawerTeam, setDrawerTeam] = useState<Team | null>(null);
  const [drawerSelections, setDrawerSelections] = useState<Set<string>>(new Set());

  const openAddPlayersDrawer = (team: Team) => {
    setDrawerTeam(team);
    setDrawerSelections(new Set());
  };

  const closeAddPlayersDrawer = async () => {
    if (!drawerTeam || drawerSelections.size === 0) {
      setDrawerTeam(null);
      return;
    }

    setSaving("batch-add");
    const userIds = Array.from(drawerSelections);

    // Track available slots locally so we don't rely on stale React state
    type SlotInfo = { pairId: string; slot: PairSlotKey };
    const openSlots: SlotInfo[] = [];

    const currentTeam = teams.find((t) => t.id === drawerTeam.id);
    for (const pair of currentTeam?.pairs || []) {
      if (!pair.player_a) openSlots.push({ pairId: pair.id, slot: "player_a_id" });
      if (!pair.player_b) openSlots.push({ pairId: pair.id, slot: "player_b_id" });
    }

    for (const userId of userIds) {
      if (openSlots.length > 0) {
        const { pairId, slot } = openSlots.shift()!;
        await fetch("/api/admin/ryder-cup/pairs", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pair_id: pairId, [slot]: userId }),
        });
      } else {
        // Create a new pair and assign as player_a
        const res = await fetch("/api/admin/ryder-cup/pairs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: drawerTeam.id }),
        });
        if (res.ok) {
          const data = await res.json();
          await fetch("/api/admin/ryder-cup/pairs", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ pair_id: data.pair.id, player_a_id: userId }),
          });
          // The new pair still has player_b open
          openSlots.push({ pairId: data.pair.id, slot: "player_b_id" });
        }
      }
    }

    await refresh();
    setSaving(null);
    setDrawerTeam(null);
  };

  const toggleDrawerSelection = (userId: string) => {
    setDrawerSelections((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Quick-assign: multi-select chips then assign to a team ──

  const [chipSelections, setChipSelections] = useState<Set<string>>(new Set());

  const toggleChipSelection = (userId: string) => {
    setChipSelections((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const batchAssignToTeam = async (team: Team) => {
    const userIds = Array.from(chipSelections);
    if (userIds.length === 0) return;

    setSaving("batch-chip-assign");

    // Pre-create empty pair cards count
    const existingRealPairs = team.pairs.filter((p) => p.sort_order > 0).length;
    const totalPlayers = getPlayersOnTeam(team).length + userIds.length;
    const neededPairCards = Math.ceil(totalPlayers / 2);
    const toCreate = Math.max(0, neededPairCards - existingRealPairs);

    // Single batch API call: creates pool pairs + real pair cards
    await fetch("/api/admin/ryder-cup/pairs/batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: team.id,
        user_ids: userIds,
        create_real_pairs: toCreate,
      }),
    });

    setChipSelections(new Set());
    await refresh();
    setSaving(null);
  };

  // ── Step 2: Tap slot → pick from list ──

  const [openSlot, setOpenSlot] = useState<{
    pairId: string;
    slot: PairSlotKey;
    teamId: string;
  } | null>(null);

  const placePlayerIntoPair = async (
    poolPairId: string,
    targetPairId: string,
    slot: PairSlotKey,
    userId: string
  ) => {
    setErrorMsg(null);
    setOpenSlot(null);

    // Find the player info from pool pair for optimistic update
    const poolPair = teams.flatMap((t) => t.pairs).find((p) => p.id === poolPairId);
    const playerInfo = poolPair?.player_a || null;

    // Optimistic UI: remove pool pair, fill target slot
    if (playerInfo) {
      setTeams((prev) =>
        prev.map((t) => ({
          ...t,
          pairs: t.pairs
            .filter((p) => p.id !== poolPairId)
            .map((p) =>
              p.id === targetPairId
                ? { ...p, [slotField(slot)]: playerInfo }
                : p
            ),
        }))
      );
    }

    // DELETE must finish first (PUT validates player isn't in another pair)
    await fetch("/api/admin/ryder-cup/pairs", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_id: poolPairId }),
    });

    const putRes = await fetch("/api/admin/ryder-cup/pairs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_id: targetPairId, [slot]: userId }),
    });

    if (!putRes.ok) {
      const data = await putRes.json();
      setErrorMsg(data.error || "Failed to place player");
      await refresh(); // Revert on failure
    }
  };

  const removePlayerFromPair = async (
    pairId: string,
    slot: PairSlotKey,
    userId: string,
    teamId: string
  ) => {
    setErrorMsg(null);

    // Find player info for optimistic update
    const pair = teams.flatMap((t) => t.pairs).find((p) => p.id === pairId);
    const playerInfo = pair?.[slotField(slot)] ?? null;

    // Optimistic UI: clear slot, add a temporary pool pair
    if (playerInfo) {
      const tempPoolId = `temp-${Date.now()}`;
      setTeams((prev) =>
        prev.map((t) => {
          if (t.id !== teamId) return t;
          return {
            ...t,
            pairs: [
              ...t.pairs.map((p) =>
                p.id === pairId
                  ? { ...p, [slotField(slot)]: null }
                  : p
              ),
              { id: tempPoolId, team_id: teamId, sort_order: 0, player_a: playerInfo, player_b: null, player_c: null },
            ],
          };
        })
      );
    }

    // 1. Clear the slot
    await fetch("/api/admin/ryder-cup/pairs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pair_id: pairId, [slot]: null }),
    });

    // 2. Create pool pair + assign player
    const res = await fetch("/api/admin/ryder-cup/pairs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, sort_order: 0 }),
    });
    if (res.ok) {
      const data = await res.json();
      await fetch("/api/admin/ryder-cup/pairs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pair_id: data.pair.id, player_a_id: userId }),
      });
    }

    // Sync with server to replace temp pool pair with real one
    await refresh();
  };

  // ── Name toggle ──

  const [showRealNames, setShowRealNames] = useState(false);

  const getName = (player: { display_name: string; full_name: string | null }) =>
    showRealNames && player.full_name ? player.full_name : player.display_name;

  const sortByName = <T extends { display_name: string; full_name: string | null }>(list: T[]) =>
    [...list].sort((a, b) => getName(a).localeCompare(getName(b)));

  // ── Helpers ──

  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);

  function getPlayersOnTeam(team: Team | undefined): PlayerInfo[] {
    if (!team) return [];
    const players: PlayerInfo[] = [];
    for (const pair of team.pairs) {
      if (pair.player_a) players.push(pair.player_a);
      if (pair.player_b) players.push(pair.player_b);
      if (pair.player_c) players.push(pair.player_c);
    }
    return players;
  }

  // All players assigned to any pair across both teams (for computing available lists)
  function getAllAssignedPlayers(): Map<string, { pairId: string; slot: "a" | "b" | "c" }> {
    const map = new Map<string, { pairId: string; slot: "a" | "b" | "c" }>();
    for (const team of teams) {
      for (const pair of team.pairs) {
        if (pair.player_a) map.set(pair.player_a.id, { pairId: pair.id, slot: "a" });
        if (pair.player_b) map.set(pair.player_b.id, { pairId: pair.id, slot: "b" });
        if (pair.player_c) map.set(pair.player_c.id, { pairId: pair.id, slot: "c" });
      }
    }
    return map;
  }

  // Players available for a specific pair slot = unassigned + players in OTHER slots on the same team
  function getAvailableForSlot(pairId: string, currentPlayerId: string | null, team: Team): UnassignedPlayer[] {
    const assigned = getAllAssignedPlayers();
    const available: UnassignedPlayer[] = [...unassigned];

    // Add players from other pair slots on this team (they can be swapped)
    for (const pair of team.pairs) {
      for (const [player, slotKey] of [
        [pair.player_a, "a"] as const,
        [pair.player_b, "b"] as const,
        [pair.player_c, "c"] as const,
      ]) {
        if (!player) continue;
        if (player.id === currentPlayerId) continue; // skip current occupant of this slot
        const assignment = assigned.get(player.id);
        if (assignment && assignment.pairId !== pairId) {
          // Player is in a different pair on the same team — show as available for reassignment
          if (pair.team_id === team.id) {
            available.push({
              user_id: player.id,
              display_name: player.display_name,
              full_name: player.full_name,
              avatar_url: player.avatar_url,
            });
          }
        }
      }
    }

    return available;
  }

  // Pool pairs (sort_order=0, has player_a) = team membership holders shown as chips
  function getPoolPairs(team: Team): Pair[] {
    return team.pairs.filter((p) => p.sort_order === 0 && p.player_a);
  }

  // Real pairs (sort_order > 0) = pair cards for the admin to fill
  function getRealPairs(team: Team): Pair[] {
    return team.pairs.filter((p) => p.sort_order > 0);
  }

  function getPairLabel(pair: Pair): string {
    const a = pair.player_a?.display_name || "—";
    const b = pair.player_b?.display_name || "—";
    return `${a} & ${b}`;
  }

  // ── Player avatar helper ──

  function Avatar({ player, size = "sm" }: { player: { display_name: string; avatar_url: string | null }; size?: "sm" | "xs" }) {
    const sizeClasses = size === "xs" ? "w-4 h-4 text-[0.5rem]" : "w-5 h-5 text-[0.5625rem]";
    if (player.avatar_url) {
      return <img src={player.avatar_url} alt="" className={`${sizeClasses} rounded-full object-cover`} />;
    }
    return (
      <span className={`${sizeClasses} rounded-full bg-green-100 flex items-center justify-center text-green-700 font-bold`}>
        {(player.display_name || "?")[0].toUpperCase()}
      </span>
    );
  }

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contest) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No Ryder Cup contest found. Add a Ryder Cup contest in the Contests section first.
      </div>
    );
  }

  // ── Step indicator ──

  const steps = [
    { num: 1, label: "Teams" },
    { num: 2, label: "Pairs" },
  ];

  return (
    <div>
      {/* Step indicator */}
      <div className="flex items-center justify-center gap-1 mb-5">
        {steps.map((s, i) => (
          <div key={s.num} className="flex items-center">
            <button
              onClick={() => setStep(s.num)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                step === s.num
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-500 hover:bg-gray-200"
              }`}
            >
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[0.625rem] font-bold ${
                step === s.num ? "bg-white/20 text-white" : "bg-gray-200 text-gray-500"
              }`}>
                {s.num}
              </span>
              {s.label}
            </button>
            {i < steps.length - 1 && (
              <div className="w-4 h-px bg-gray-200 mx-0.5" />
            )}
          </div>
        ))}
      </div>

      {/* Error message */}
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
          <p className="text-sm text-red-700">{errorMsg}</p>
          <button onClick={() => setErrorMsg(null)} className={`mt-2 ${BTN_NEUTRAL}`}>
            Dismiss
          </button>
        </div>
      )}

      {/* Step 1: Teams */}
      {step === 1 && (
        <div>
          {/* Unassigned banner */}
          {unassigned.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                Unassigned ({unassigned.length}) — select players, then assign
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((player) => {
                  const isSelected = chipSelections.has(player.user_id);
                  return (
                    <button
                      key={player.user_id}
                      onClick={() => toggleChipSelection(player.user_id)}
                      disabled={saving === "batch-chip-assign"}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        isSelected
                          ? "bg-green-100 text-green-800 border-green-400 ring-1 ring-green-400"
                          : "bg-white text-gray-700 border-amber-200 active:bg-green-50"
                      }`}
                    >
                      <Avatar player={player} size="xs" />
                      {player.display_name}
                    </button>
                  );
                })}
              </div>

              {/* Assign-to-team buttons (visible when any chips selected) */}
              {chipSelections.size > 0 && team1 && team2 && (
                <div className="flex gap-2 mt-3">
                  {saving === "batch-chip-assign" ? (
                    <div className="flex-1 flex items-center justify-center py-2">
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                      <span className="ml-2 text-xs text-gray-500">Assigning {chipSelections.size}...</span>
                    </div>
                  ) : (
                    <>
                      <button
                        onClick={() => batchAssignToTeam(team1)}
                        className="flex-1 py-2 text-xs font-semibold text-blue-700 bg-blue-50 border border-blue-200 rounded-lg active:bg-blue-100 transition-colors"
                      >
                        Add {chipSelections.size} → {team1.team_name || "Team 1"}
                      </button>
                      <button
                        onClick={() => batchAssignToTeam(team2)}
                        className="flex-1 py-2 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg active:bg-red-100 transition-colors"
                      >
                        Add {chipSelections.size} → {team2.team_name || "Team 2"}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Team cards side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            {[team1, team2].map((team) => {
              if (!team) return null;
              const players = getPlayersOnTeam(team);

              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Team name + color */}
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 space-y-1.5">
                    <input
                      type="text"
                      value={team.team_name || ""}
                      onChange={(e) =>
                        setTeams((prev) =>
                          prev.map((t) => (t.id === team.id ? { ...t, team_name: e.target.value } : t))
                        )
                      }
                      onBlur={() => updateTeamName(team.id, team.team_name || "")}
                      className="w-full text-sm font-semibold text-gray-700 bg-transparent border-none outline-none p-0"
                      placeholder={`Team ${team.team_number}`}
                    />
                    <div className="flex items-center gap-1">
                      {["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316"].map((hex) => (
                        <button
                          key={hex}
                          onClick={() => updateTeamColor(team.id, hex)}
                          className={`w-5 h-5 rounded-full border-2 transition-all ${
                            team.team_color === hex ? "border-gray-700 scale-110" : "border-transparent"
                          }`}
                          style={{ backgroundColor: hex }}
                        />
                      ))}
                    </div>
                  </div>

                  {/* Players */}
                  <div className="px-3 py-2 space-y-1">
                    {players.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No players</p>
                    ) : (
                      players.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center gap-1.5 text-xs text-gray-700"
                        >
                          <Avatar player={p} size="xs" />
                          <span className="flex-1 truncate">{p.display_name}</span>
                          <button
                            onClick={() => {
                              // Find the pair this player is in and remove them
                              for (const pair of team.pairs) {
                                if (pair.player_a?.id === p.id) {
                                  assignPlayer(pair.id, "player_a_id", null);
                                  return;
                                }
                                if (pair.player_b?.id === p.id) {
                                  assignPlayer(pair.id, "player_b_id", null);
                                  return;
                                }
                                if (pair.player_c?.id === p.id) {
                                  assignPlayer(pair.id, "player_c_id", null);
                                  return;
                                }
                              }
                            }}
                            className="text-gray-300 hover:text-red-500"
                          >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))
                    )}

                    {/* Add players button */}
                    {unassigned.length > 0 && (
                      <button
                        onClick={() => openAddPlayersDrawer(team)}
                        className="text-xs text-green-700 font-medium mt-1"
                      >
                        + Add Players
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 2: Pairs */}
      {step === 2 && (
        <div>
          {/* Unassigned players banner (not on any team yet) */}
          {unassigned.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4">
              <p className="text-[0.625rem] font-semibold text-amber-700 uppercase tracking-wide mb-1.5">
                Not on a team ({unassigned.length}) — assign in Step 1 first
              </p>
              <div className="flex flex-wrap gap-1">
                {unassigned.map((player) => (
                  <span
                    key={player.user_id}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-gray-500 border border-amber-200 bg-white"
                  >
                    <Avatar player={player} size="xs" />
                    {player.display_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[team1, team2].map((team) => {
              if (!team) return null;
              const poolPairs = getPoolPairs(team);
              const realPairs = getRealPairs(team);

              return (
                <div key={team.id}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    {team.team_name || `Team ${team.team_number}`}
                    {poolPairs.length > 0 && (
                      <span className="text-[0.625rem] font-normal text-gray-400 ml-1">
                        ({poolPairs.length} unplaced)
                      </span>
                    )}
                  </h3>

                  {/* Pair cards */}
                  <div className="space-y-2">
                    {realPairs.map((pair, idx) => {
                      const isSlotAOpen = openSlot?.pairId === pair.id && openSlot?.slot === "player_a_id";
                      const isSlotBOpen = openSlot?.pairId === pair.id && openSlot?.slot === "player_b_id";
                      const isSlotCOpen = openSlot?.pairId === pair.id && openSlot?.slot === "player_c_id";

                      return (
                        <div
                          key={pair.id}
                          className="bg-white rounded-xl border border-gray-200 shadow-sm p-3"
                        >
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[0.625rem] font-semibold text-gray-400 uppercase">
                              Pair {idx + 1}
                            </span>
                            <button
                              onClick={() => deletePair(pair.id)}
                              className="text-gray-300 hover:text-red-500"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>

                          {/* Slot A */}
                          <PairSlot
                            label="A"
                            player={pair.player_a}
                            pairId={pair.id}
                            slot="player_a_id"
                            teamId={team.id}
                            isOpen={isSlotAOpen}
                            availablePlayers={poolPairs}
                            saving={saving}
                            onTapEmpty={() => setOpenSlot({ pairId: pair.id, slot: "player_a_id", teamId: team.id })}
                            onCancel={() => setOpenSlot(null)}
                            onPickPlayer={(poolPair) => placePlayerIntoPair(poolPair.id, pair.id, "player_a_id", poolPair.player_a!.id)}
                            onRemove={() => removePlayerFromPair(pair.id, "player_a_id", pair.player_a!.id, team.id)}
                          />

                          {/* Slot B */}
                          <PairSlot
                            label="B"
                            player={pair.player_b}
                            pairId={pair.id}
                            slot="player_b_id"
                            teamId={team.id}
                            isOpen={isSlotBOpen}
                            availablePlayers={poolPairs}
                            saving={saving}
                            onTapEmpty={() => setOpenSlot({ pairId: pair.id, slot: "player_b_id", teamId: team.id })}
                            onCancel={() => setOpenSlot(null)}
                            onPickPlayer={(poolPair) => placePlayerIntoPair(poolPair.id, pair.id, "player_b_id", poolPair.player_a!.id)}
                            onRemove={() => removePlayerFromPair(pair.id, "player_b_id", pair.player_b!.id, team.id)}
                          />

                          {/* Slot C — optional 3rd player for uneven teams (1v2 / 2v3 / 3v3) */}
                          {(pair.player_c || pair.player_a || pair.player_b) ? (
                            <PairSlot
                              label="C"
                              player={pair.player_c}
                              pairId={pair.id}
                              slot="player_c_id"
                              teamId={team.id}
                              isOpen={isSlotCOpen}
                              availablePlayers={poolPairs}
                              saving={saving}
                              optional
                              onTapEmpty={() => setOpenSlot({ pairId: pair.id, slot: "player_c_id", teamId: team.id })}
                              onCancel={() => setOpenSlot(null)}
                              onPickPlayer={(poolPair) => placePlayerIntoPair(poolPair.id, pair.id, "player_c_id", poolPair.player_a!.id)}
                              onRemove={() => removePlayerFromPair(pair.id, "player_c_id", pair.player_c!.id, team.id)}
                            />
                          ) : null}
                        </div>
                      );
                    })}

                    {/* New Pair button — only if unplaced players outnumber empty slots */}
                    {(() => {
                      const emptySlots = realPairs.reduce(
                        (n, p) => n + (p.player_a ? 0 : 1) + (p.player_b ? 0 : 1) + (p.player_c ? 0 : 1),
                        0,
                      );
                      return poolPairs.length > emptySlots;
                    })() && (
                      <button
                        onClick={() => createPair(team.id)}
                        disabled={saving !== null}
                        className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-xs font-medium text-gray-500 active:bg-gray-50 disabled:opacity-50"
                      >
                        {saving === `new-pair-${team.id}` ? "Creating..." : "+ New Pair"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

        </div>
      )}

      {/* Add Players Drawer */}
      <BottomDrawer
        open={!!drawerTeam}
        onClose={closeAddPlayersDrawer}
        title={`Add to ${drawerTeam?.team_name || "Team"}`}
        subtitle={`${drawerSelections.size} selected · ${unassigned.length} available`}
      >
        {saving === "batch-add" ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div>
            <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
              <button
                onClick={() => setShowRealNames(!showRealNames)}
                className="text-xs text-green-700 font-medium"
              >
                Show {showRealNames ? "nicknames" : "real names"}
              </button>
            </div>
            <div className="divide-y divide-gray-50">
              {sortByName(unassigned).map((player) => {
                const selected = drawerSelections.has(player.user_id);
                return (
                  <button
                    key={player.user_id}
                    onClick={() => toggleDrawerSelection(player.user_id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors"
                  >
                    <div
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                        selected ? "bg-green-600 border-green-600" : "border-gray-300"
                      }`}
                    >
                      {selected && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                    {player.avatar_url ? (
                      <img src={player.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                        {getName(player)[0].toUpperCase()}
                      </div>
                    )}
                    <span className="text-sm font-medium text-gray-900 flex-1">
                      {getName(player)}
                    </span>
                  </button>
                );
              })}
              {unassigned.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-gray-400">
                  All players have been assigned to a team.
                </div>
              )}
            </div>
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

// ── Sub-components ──

function PairSlot({
  label,
  player,
  isOpen,
  availablePlayers,
  saving,
  optional,
  onTapEmpty,
  onCancel,
  onPickPlayer,
  onRemove,
}: {
  label: string;
  player: PlayerInfo | null;
  pairId: string;
  slot: PairSlotKey;
  teamId: string;
  isOpen: boolean;
  availablePlayers: Pair[];
  saving: string | null;
  optional?: boolean;
  onTapEmpty: () => void;
  onCancel: () => void;
  onPickPlayer: (poolPair: Pair) => void;
  onRemove: () => void;
}) {
  if (player) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-[0.625rem] font-bold text-gray-400 w-3">{label}</span>
        <div className="flex items-center gap-1.5 flex-1">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5rem] font-bold">
              {(player.display_name || "?")[0].toUpperCase()}
            </span>
          )}
          <span className="text-xs text-gray-700 flex-1 truncate">{player.display_name}</span>
          <button
            onClick={onRemove}
            disabled={saving !== null}
            className="text-gray-300 hover:text-red-500"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    );
  }

  if (isOpen) {
    return (
      <div className="py-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-[0.625rem] font-bold text-gray-400 w-3">{label}</span>
          <span className="text-[0.625rem] text-green-600 font-medium flex-1">Select a player:</span>
          <button onClick={onCancel} className="text-[0.625rem] text-gray-400">
            Cancel
          </button>
        </div>
        <div className="space-y-0.5 ml-5">
          {availablePlayers.length === 0 ? (
            <p className="text-[0.625rem] text-gray-400 italic">No available players</p>
          ) : (
            [...availablePlayers].sort((a, b) => (a.player_a?.display_name || "").localeCompare(b.player_a?.display_name || "")).map((pp) => {
              const p = pp.player_a!;
              return (
                <button
                  key={p.id}
                  onClick={() => onPickPlayer(pp)}
                  disabled={saving !== null}
                  className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-50 active:bg-green-50 text-left text-xs"
                >
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5rem] font-bold">
                      {(p.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}
                  <span className="text-gray-700">{p.display_name}</span>
                </button>
              );
            })
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 py-1">
      <span className={`text-[0.625rem] font-bold w-3 ${optional ? "text-gray-300" : "text-gray-400"}`}>{label}</span>
      <button
        onClick={onTapEmpty}
        disabled={saving !== null}
        className={`text-xs italic hover:text-green-700 ${optional ? "text-gray-300" : "text-gray-400"}`}
      >
        {optional ? "+ Add 3rd player" : "Tap to assign"}
      </button>
    </div>
  );
}

