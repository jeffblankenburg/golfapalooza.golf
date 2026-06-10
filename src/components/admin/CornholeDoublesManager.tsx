"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface TeamMember {
  id: string;
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Team {
  id: string;
  contest_id: string;
  members: TeamMember[];
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
}

export function CornholeDoublesManager({ tripId }: { tripId: string }) {
  const [contest, setContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedPlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selectedPlayers, setSelectedPlayers] = useState<Set<string>>(new Set());
  const [drawerTeamId, setDrawerTeamId] = useState<string | null>(null);
  const [showRealNames, setShowRealNames] = useState(false);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Fetch cornhole_doubles contest for this trip
  const fetchContest = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const cornhole = (data.contests || []).find(
      (c: { contest_type: string }) => c.contest_type === "cornhole_doubles"
    );
    setContest(cornhole || null);
    return cornhole || null;
  }, [tripId]);

  // Fetch teams for a contest
  const fetchTeams = useCallback(async (contestId: string) => {
    const res = await fetch(`/api/admin/cornhole?contest_id=${contestId}`);
    const data = await res.json();
    setTeams(data.teams || []);
    setUnassigned(data.unassigned || []);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      const c = await fetchContest();
      if (c) await fetchTeams(c.id);
      setLoading(false);
    }
    init();
  }, [fetchContest, fetchTeams]);

  // ── Name helpers ──

  const getName = (player: { display_name: string; full_name: string | null }) =>
    showRealNames && player.full_name ? player.full_name : player.display_name;

  const sortByName = <T extends { display_name: string; full_name: string | null }>(list: T[]) =>
    [...list].sort((a, b) => getName(a).localeCompare(getName(b)));

  // ── Team CRUD ──

  const createTeam = async () => {
    if (!contest) return;
    setSaving("new-team");

    const res = await fetch("/api/admin/cornhole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contest.id }),
    });

    if (res.ok) {
      await fetchTeams(contest.id);
    }
    setSaving(null);
  };

  const createPairFromSelection = async () => {
    if (!contest || selectedPlayers.size !== 2) return;
    setSaving("create-pair");

    // Create the team
    const teamRes = await fetch("/api/admin/cornhole", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contest.id }),
    });

    if (teamRes.ok) {
      const { team } = await teamRes.json();
      // Add both members
      const players = Array.from(selectedPlayers);
      for (const userId of players) {
        await fetch("/api/admin/cornhole/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: team.id, user_id: userId }),
        });
      }
      setSelectedPlayers(new Set());
      await fetchTeams(contest.id);
    }
    setSaving(null);
  };

  const deleteTeam = (team: Team) => {
    setConfirmModal({
      title: "Delete Pair",
      message: `Delete this pair${team.members.length > 0 ? ` (${team.members.map((m) => getName(m)).join(" & ")})` : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/cornhole", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: team.id }),
        });
        if (contest) {
          await fetchTeams(contest.id);
        }
      },
    });
  };

  // ── Member CRUD ──

  const addMember = async (teamId: string, userId: string) => {
    setSaving(`add-${userId}`);

    // Optimistic update
    const player = unassigned.find((u) => u.user_id === userId);
    if (player) {
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? {
                ...t,
                members: [
                  ...t.members,
                  { id: `temp-${userId}`, user_id: userId, display_name: player.display_name, full_name: player.full_name, avatar_url: player.avatar_url },
                ],
              }
            : t
        )
      );
      setUnassigned((prev) => prev.filter((u) => u.user_id !== userId));
    }

    const res = await fetch("/api/admin/cornhole/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_id: userId }),
    });

    if (!res.ok) {
      // Revert
      if (contest) await fetchTeams(contest.id);
    }

    setSaving(null);
  };

  const removeMember = async (teamId: string, member: TeamMember) => {
    setSaving(`remove-${member.user_id}`);

    // Optimistic update
    setTeams((prev) =>
      prev.map((t) =>
        t.id === teamId
          ? { ...t, members: t.members.filter((m) => m.user_id !== member.user_id) }
          : t
      )
    );
    setUnassigned((prev) => [
      ...prev,
      { user_id: member.user_id, display_name: member.display_name, full_name: member.full_name, avatar_url: member.avatar_url },
    ]);

    const res = await fetch("/api/admin/cornhole/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_id: member.user_id }),
    });

    if (!res.ok) {
      if (contest) await fetchTeams(contest.id);
    }

    setSaving(null);
  };

  // ── Selection helpers ──

  const toggleSelection = (userId: string) => {
    setSelectedPlayers((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  // ── Drawer helpers ──

  const handleResetAll = async () => {
    if (!contest) return;
    await fetch(`/api/admin/cornhole?contest_id=${contest.id}`, { method: "DELETE" });
    await fetchTeams(contest.id);
  };

  const openDrawer = (teamId: string) => {
    setDrawerTeamId(teamId);
  };

  const closeDrawer = () => {
    setDrawerTeamId(null);
  };

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
        No Cornhole Doubles contest found. Add one in the Contests section.
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-gray-900">{contest.name}</h2>
        <button
          onClick={() => setShowRealNames(!showRealNames)}
          className="text-xs text-green-700 font-medium"
        >
          Show {showRealNames ? "nicknames" : "real names"}
        </button>
      </div>

      {/* Unassigned Players */}
      {unassigned.length > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4">
          <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
            Unassigned ({unassigned.length})
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sortByName(unassigned).map((player) => {
              const selected = selectedPlayers.has(player.user_id);
              return (
                <button
                  key={player.user_id}
                  onClick={() => toggleSelection(player.user_id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    selected
                      ? "bg-green-100 text-green-800 border-green-400"
                      : "bg-white text-gray-700 border-amber-200 active:bg-amber-100"
                  }`}
                >
                  {player.avatar_url ? (
                    <img src={player.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5rem] font-bold">
                      {(getName(player) || "?")[0].toUpperCase()}
                    </span>
                  )}
                  {getName(player)}
                  {selected && (
                    <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Create Pair button appears when exactly 2 selected */}
          {selectedPlayers.size === 2 && (
            <button
              onClick={createPairFromSelection}
              disabled={saving === "create-pair"}
              className="mt-3 w-full py-2 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700 disabled:opacity-50"
            >
              {saving === "create-pair" ? "Creating..." : "Create Pair"}
            </button>
          )}
          {selectedPlayers.size > 0 && selectedPlayers.size !== 2 && (
            <p className="mt-2 text-xs text-amber-600">
              Select {2 - selectedPlayers.size > 0 ? `${2 - selectedPlayers.size} more` : "fewer"} player{selectedPlayers.size < 2 && 2 - selectedPlayers.size === 1 ? "" : "s"} to create a pair
            </p>
          )}
        </div>
      )}

      {/* Pairs */}
      <div className="space-y-3">
        {teams.map((team, index) => (
          <div
            key={team.id}
            className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
          >
            {/* Pair header */}
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">
                Pair {index + 1}
              </span>
              <button
                onClick={() => deleteTeam(team)}
                className="text-gray-300 hover:text-red-500 p-0.5"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Members */}
            <div className="px-4 py-2">
              {team.members.length === 0 ? (
                <p className="text-xs text-gray-400 italic py-1">No players yet</p>
              ) : (
                <div className="flex flex-wrap gap-1.5 py-1">
                  {team.members.map((member) => (
                    <span
                      key={member.user_id}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full text-xs font-medium text-green-800"
                    >
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-[0.5rem] font-bold">
                          {(getName(member) || "?")[0].toUpperCase()}
                        </span>
                      )}
                      {getName(member)}
                      <button
                        onClick={() => removeMember(team.id, member)}
                        className="ml-0.5 text-green-500 hover:text-red-500"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Add Player button when team has < 2 members */}
              {team.members.length < 2 && unassigned.length > 0 && (
                <div className="mt-1 mb-1">
                  <button
                    onClick={() => openDrawer(team.id)}
                    className="text-xs text-green-700 font-medium"
                  >
                    + Add Player
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* New Pair Button */}
      <button
        onClick={createTeam}
        disabled={saving === "new-team"}
        className="w-full mt-3 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 active:bg-gray-50 disabled:opacity-50"
      >
        {saving === "new-team" ? "Creating..." : "+ New Pair"}
      </button>

      {/* Reset All */}
      {teams.length > 0 && (
        <button
          onClick={() =>
            setConfirmModal({
              title: "Reset All Pairs",
              message: "This will delete ALL cornhole doubles pairs. All players will become unassigned. This cannot be undone.",
              onConfirm: async () => {
                setConfirmModal(null);
                await handleResetAll();
              },
            })
          }
          className="w-full mt-3 py-2.5 text-sm font-semibold text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
        >
          Reset All Pairs
        </button>
      )}

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => confirmModal?.onConfirm()}
        onCancel={() => setConfirmModal(null)}
      />

      <BottomDrawer
        open={!!drawerTeamId}
        onClose={closeDrawer}
        title={`Add to Pair ${drawerTeamId ? teams.findIndex((t) => t.id === drawerTeamId) + 1 : ""}`}
        subtitle={`${unassigned.length} available`}
      >
        <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
          <button
            onClick={() => setShowRealNames(!showRealNames)}
            className="text-xs text-green-700 font-medium"
          >
            Show {showRealNames ? "nicknames" : "real names"}
          </button>
        </div>
        {sortByName(unassigned).map((player) => (
          <button
            key={player.user_id}
            onClick={async () => {
              if (drawerTeamId) {
                await addMember(drawerTeamId, player.user_id);
                // Auto-close drawer if team is now full
                const team = teams.find((t) => t.id === drawerTeamId);
                if (team && team.members.length >= 1) {
                  closeDrawer();
                }
              }
            }}
            disabled={saving === `add-${player.user_id}`}
            className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {player.avatar_url ? (
              <img src={player.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
            ) : (
              <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                {getName(player)[0].toUpperCase()}
              </span>
            )}
            <span className="text-sm font-medium text-gray-900">{getName(player)}</span>
          </button>
        ))}
      </BottomDrawer>
    </div>
  );
}
