"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

// ── Types ──

interface PlayerInfo {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Pair {
  id: string;
  team_id: string;
  sort_order: number;
  player_a: PlayerInfo | null;
  player_b: PlayerInfo | null;
}

interface Team {
  id: string;
  contest_id: string;
  team_number: number;
  team_name: string | null;
  pairs: Pair[];
}

interface Foursome {
  id: string;
  contest_id: string;
  pair_team1_id: string;
  pair_team2_id: string;
  sort_order: number;
}

interface UnassignedPlayer {
  user_id: string;
  display_name: string;
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
  const [foursomes, setFoursomes] = useState<Foursome[]>([]);
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
    setFoursomes(data.foursomes || []);
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
    slot: "player_a_id" | "player_b_id",
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
    setConfirmModal({
      title: "Delete Pair",
      message: "Delete this pair? This cannot be undone.",
      onConfirm: async () => {
        setConfirmModal(null);
        setErrorMsg(null);
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

  // ── Foursome CRUD ──

  const [newFoursomePair1, setNewFoursomePair1] = useState<string>("");
  const [newFoursomePair2, setNewFoursomePair2] = useState<string>("");

  const createFoursome = async () => {
    if (!contest || !newFoursomePair1 || !newFoursomePair2) return;
    setSaving("new-foursome");
    setErrorMsg(null);
    const res = await fetch("/api/admin/ryder-cup/foursomes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: contest.id,
        pair_team1_id: newFoursomePair1,
        pair_team2_id: newFoursomePair2,
      }),
    });
    if (!res.ok) {
      const data = await res.json();
      setErrorMsg(data.error || "Failed to create foursome");
    } else {
      setNewFoursomePair1("");
      setNewFoursomePair2("");
    }
    await refresh();
    setSaving(null);
  };

  const deleteFoursome = (foursomeId: string) => {
    setConfirmModal({
      title: "Delete Foursome",
      message: "Remove this foursome matchup?",
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/ryder-cup/foursomes", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ foursome_id: foursomeId }),
        });
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
    type SlotInfo = { pairId: string; slot: "player_a_id" | "player_b_id" };
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

  // ── Helpers ──

  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);

  function getPlayersOnTeam(team: Team | undefined): PlayerInfo[] {
    if (!team) return [];
    const players: PlayerInfo[] = [];
    for (const pair of team.pairs) {
      if (pair.player_a) players.push(pair.player_a);
      if (pair.player_b) players.push(pair.player_b);
    }
    return players;
  }

  // All players assigned to any pair across both teams (for computing available lists)
  function getAllAssignedPlayers(): Map<string, { pairId: string; slot: "a" | "b" }> {
    const map = new Map<string, { pairId: string; slot: "a" | "b" }>();
    for (const team of teams) {
      for (const pair of team.pairs) {
        if (pair.player_a) map.set(pair.player_a.id, { pairId: pair.id, slot: "a" });
        if (pair.player_b) map.set(pair.player_b.id, { pairId: pair.id, slot: "b" });
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
              avatar_url: player.avatar_url,
            });
          }
        }
      }
    }

    return available;
  }

  function getPairLabel(pair: Pair): string {
    const a = pair.player_a?.display_name || "—";
    const b = pair.player_b?.display_name || "—";
    return `${a} & ${b}`;
  }

  // Available pairs for foursomes (not already in one)
  const usedPairIds = new Set(
    foursomes.flatMap((f) => [f.pair_team1_id, f.pair_team2_id])
  );

  function getAvailablePairs(team: Team | undefined): Pair[] {
    if (!team) return [];
    return team.pairs.filter((p) => !usedPairIds.has(p.id));
  }

  // Unmatched pairs for the banner
  const unmatchedPairsTeam1 = getAvailablePairs(team1);
  const unmatchedPairsTeam2 = getAvailablePairs(team2);

  // ── Player avatar helper ──

  function Avatar({ player, size = "sm" }: { player: { display_name: string; avatar_url: string | null }; size?: "sm" | "xs" }) {
    const sizeClasses = size === "xs" ? "w-4 h-4 text-[8px]" : "w-5 h-5 text-[9px]";
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
    { num: 3, label: "Foursomes" },
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
              <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
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
          <button onClick={() => setErrorMsg(null)} className="text-xs text-red-500 mt-1">
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
                Unassigned ({unassigned.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((player) => (
                  <span
                    key={player.user_id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-full text-xs font-medium text-gray-700 border border-amber-200"
                  >
                    <Avatar player={player} size="xs" />
                    {player.display_name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Team cards side-by-side */}
          <div className="grid grid-cols-2 gap-3">
            {[team1, team2].map((team) => {
              if (!team) return null;
              const players = getPlayersOnTeam(team);

              return (
                <div key={team.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  {/* Team name */}
                  <div className="px-3 py-2 bg-gray-50 border-b border-gray-100">
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
          {/* Unpaired players banner */}
          {unassigned.length > 0 && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                Unpaired Players ({unassigned.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {unassigned.map((player) => (
                  <span
                    key={player.user_id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white rounded-full text-xs font-medium text-gray-700 border border-amber-200"
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

              return (
                <div key={team.id}>
                  <h3 className="text-sm font-semibold text-gray-700 mb-2">
                    {team.team_name || `Team ${team.team_number}`}
                  </h3>

                  <div className="space-y-2">
                    {team.pairs.map((pair) => {
                      const availableA = getAvailableForSlot(pair.id, pair.player_a?.id || null, team);
                      const availableB = getAvailableForSlot(pair.id, pair.player_b?.id || null, team);

                      return (
                      <div
                        key={pair.id}
                        className="bg-white rounded-xl border border-gray-200 shadow-sm p-3"
                      >
                        {/* Player A */}
                        <PlayerSlot
                          label="A"
                          player={pair.player_a}
                          pairId={pair.id}
                          slot="player_a_id"
                          unassigned={availableA}
                          saving={saving}
                          onAssign={assignPlayer}
                        />
                        {/* Player B */}
                        <PlayerSlot
                          label="B"
                          player={pair.player_b}
                          pairId={pair.id}
                          slot="player_b_id"
                          unassigned={availableB}
                          saving={saving}
                          onAssign={assignPlayer}
                        />
                        {/* Delete pair */}
                        <button
                          onClick={() => deletePair(pair.id)}
                          className="text-xs text-gray-300 hover:text-red-500 mt-1"
                        >
                          Delete pair
                        </button>
                      </div>
                      );
                    })}

                    {/* New Pair button */}
                    <button
                      onClick={() => createPair(team.id)}
                      disabled={saving !== null}
                      className="w-full py-2 border-2 border-dashed border-gray-300 rounded-xl text-xs font-medium text-gray-500 active:bg-gray-50 disabled:opacity-50"
                    >
                      {saving === `new-pair-${team.id}` ? "Creating..." : "+ New Pair"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 3: Foursomes */}
      {step === 3 && (
        <div>
          {/* Unmatched pairs banner */}
          {(unmatchedPairsTeam1.length > 0 || unmatchedPairsTeam2.length > 0) && (
            <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4">
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                Unmatched Pairs
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-gray-600">
                <div>
                  <span className="font-medium">{team1?.team_name || "Team 1"}:</span>{" "}
                  {unmatchedPairsTeam1.length > 0
                    ? unmatchedPairsTeam1.map((p) => getPairLabel(p)).join(", ")
                    : "All matched"}
                </div>
                <div>
                  <span className="font-medium">{team2?.team_name || "Team 2"}:</span>{" "}
                  {unmatchedPairsTeam2.length > 0
                    ? unmatchedPairsTeam2.map((p) => getPairLabel(p)).join(", ")
                    : "All matched"}
                </div>
              </div>
            </div>
          )}

          {/* Existing foursomes */}
          <div className="space-y-3">
            {foursomes.map((foursome, i) => {
              const p1 = team1?.pairs.find((p) => p.id === foursome.pair_team1_id);
              const p2 = team2?.pairs.find((p) => p.id === foursome.pair_team2_id);

              return (
                <div
                  key={foursome.id}
                  className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
                >
                  <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                    <span className="text-sm font-semibold text-gray-700">
                      Foursome {i + 1}
                    </span>
                    <button
                      onClick={() => deleteFoursome(foursome.id)}
                      className="text-gray-300 hover:text-red-500 p-0.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                        {team1?.team_name || "Team 1"}
                      </p>
                      <p className="text-sm font-medium text-gray-800">
                        {p1 ? getPairLabel(p1) : "—"}
                      </p>
                    </div>
                    <span className="text-xs font-bold text-gray-300">vs</span>
                    <div className="flex-1 text-center">
                      <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                        {team2?.team_name || "Team 2"}
                      </p>
                      <p className="text-sm font-medium text-gray-800">
                        {p2 ? getPairLabel(p2) : "—"}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* New foursome */}
          {unmatchedPairsTeam1.length > 0 && unmatchedPairsTeam2.length > 0 && (
            <div className="mt-3 bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <p className="text-sm font-semibold text-gray-700 mb-3">New Foursome</p>
              <div className="flex gap-2 mb-3">
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                    {team1?.team_name || "Team 1"} Pair
                  </label>
                  <select
                    value={newFoursomePair1}
                    onChange={(e) => setNewFoursomePair1(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    style={{ backgroundColor: "transparent" }}
                  >
                    <option value="">Select...</option>
                    {unmatchedPairsTeam1.map((p) => (
                      <option key={p.id} value={p.id}>
                        {getPairLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-1">
                    {team2?.team_name || "Team 2"} Pair
                  </label>
                  <select
                    value={newFoursomePair2}
                    onChange={(e) => setNewFoursomePair2(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
                    style={{ backgroundColor: "transparent" }}
                  >
                    <option value="">Select...</option>
                    {unmatchedPairsTeam2.map((p) => (
                      <option key={p.id} value={p.id}>
                        {getPairLabel(p)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <button
                onClick={createFoursome}
                disabled={!newFoursomePair1 || !newFoursomePair2 || saving === "new-foursome"}
                className="w-full py-2 bg-green-600 text-white rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {saving === "new-foursome" ? "Creating..." : "Create Foursome"}
              </button>
            </div>
          )}

          {foursomes.length === 0 && unmatchedPairsTeam1.length === 0 && unmatchedPairsTeam2.length === 0 && (
            <div className="text-center py-8 text-gray-400 text-sm">
              Create pairs first in Step 2.
            </div>
          )}
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
          <div className="divide-y divide-gray-50">
            {unassigned.map((player) => {
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
                      {(player.display_name || "?")[0].toUpperCase()}
                    </div>
                  )}
                  <span className="text-sm font-medium text-gray-900 flex-1">
                    {player.display_name}
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

function PlayerSlot({
  label,
  player,
  pairId,
  slot,
  unassigned,
  saving,
  onAssign,
}: {
  label: string;
  player: { id: string; display_name: string; avatar_url: string | null } | null;
  pairId: string;
  slot: "player_a_id" | "player_b_id";
  unassigned: UnassignedPlayer[];
  saving: string | null;
  onAssign: (pairId: string, slot: "player_a_id" | "player_b_id", userId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[10px] font-bold text-gray-400 w-3">{label}</span>
      {player ? (
        <div className="flex items-center gap-1.5 flex-1">
          {player.avatar_url ? (
            <img src={player.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
          ) : (
            <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
              {(player.display_name || "?")[0].toUpperCase()}
            </span>
          )}
          <span className="text-xs text-gray-700 flex-1 truncate">{player.display_name}</span>
          <button
            onClick={() => onAssign(pairId, slot, null)}
            className="text-gray-300 hover:text-red-500"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ) : open ? (
        <div className="flex-1 space-y-0.5">
          {unassigned.length === 0 ? (
            <p className="text-[10px] text-gray-400 italic">No available players</p>
          ) : (
            unassigned.map((p) => (
              <button
                key={p.user_id}
                onClick={() => {
                  onAssign(pairId, slot, p.user_id);
                  setOpen(false);
                }}
                disabled={saving !== null}
                className="w-full flex items-center gap-1.5 px-1.5 py-1 rounded hover:bg-gray-50 text-left text-xs"
              >
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
                    {(p.display_name || "?")[0].toUpperCase()}
                  </span>
                )}
                <span className="text-gray-700">{p.display_name}</span>
              </button>
            ))
          )}
          <button onClick={() => setOpen(false)} className="text-[10px] text-gray-400">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-gray-400 hover:text-green-700 italic"
        >
          Tap to assign
        </button>
      )}
    </div>
  );
}
