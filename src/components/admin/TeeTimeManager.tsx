"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface TeeTimePlayer {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface ScrambleTeamMember {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface ScrambleTeam {
  id: string;
  members: ScrambleTeamMember[];
}

interface TeeTimeGroup {
  id: string;
  trip_id: string;
  day_number: number;
  tee_time: string | null;
  starting_hole: number | null;
  scramble_team_id: string | null;
  players: TeeTimePlayer[];
}

interface UnassignedPlayer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Day {
  number: number;
  label: string;
  sublabel: string;
}

type View = "days" | "groups";

const DAYS: Day[] = [
  { number: 1, label: "Day 1", sublabel: "Wednesday — KGB Cup" },
  { number: 2, label: "Day 2", sublabel: "Thursday — Scramble" },
  { number: 3, label: "Day 3", sublabel: "Friday — Scramble" },
  { number: 4, label: "Day 4", sublabel: "Saturday — Scramble" },
];

export function TeeTimeManager({ tripId }: { tripId: string }) {
  const [selectedDay, setSelectedDay] = useState<Day | null>(null);
  const [groups, setGroups] = useState<TeeTimeGroup[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedPlayer[]>([]);
  const [scrambleTeams, setScrambleTeams] = useState<ScrambleTeam[]>([]);
  const [view, setView] = useState<View>("days");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const [addingToGroup, setAddingToGroup] = useState<string | null>(null);
  const [dayCounts, setDayCounts] = useState<Record<number, number>>({});

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const isScrambleDay = scrambleTeams.length > 0;

  // Fetch tee time counts per day
  const fetchDayCounts = useCallback(async () => {
    const counts: Record<number, number> = {};
    const results = await Promise.all(
      DAYS.map((day) =>
        fetch(`/api/admin/tee-times?trip_id=${tripId}&day_number=${day.number}`)
          .then((res) => res.json())
          .then((data) => ({ day: day.number, count: (data.groups || []).length }))
      )
    );
    for (const r of results) {
      counts[r.day] = r.count;
    }
    setDayCounts(counts);
  }, [tripId]);

  useEffect(() => {
    fetchDayCounts();
  }, [fetchDayCounts]);

  // Fetch tee time groups for a day
  const fetchGroups = useCallback(async (dayNumber: number) => {
    const res = await fetch(`/api/admin/tee-times?trip_id=${tripId}&day_number=${dayNumber}`);
    const data = await res.json();
    const sortedGroups = (data.groups || []).sort((a: TeeTimeGroup, b: TeeTimeGroup) => {
      if (!a.tee_time && !b.tee_time) return 0;
      if (!a.tee_time) return 1;
      if (!b.tee_time) return -1;
      return a.tee_time.localeCompare(b.tee_time);
    });
    setGroups(sortedGroups);
    setUnassigned(data.unassigned || []);
    setScrambleTeams(data.scramble_teams || []);
  }, [tripId]);

  // ── Helpers ──

  function getTeamMembers(teamId: string): ScrambleTeamMember[] {
    return scrambleTeams.find((t) => t.id === teamId)?.members || [];
  }

  function getUnassignedTeams(): ScrambleTeam[] {
    const assignedTeamIds = new Set(groups.map((g) => g.scramble_team_id).filter(Boolean));
    return scrambleTeams.filter((t) => !assignedTeamIds.has(t.id));
  }

  function getTeamLabel(team: ScrambleTeam): string {
    return team.members.map((m) => m.display_name).join(", ") || "Empty team";
  }

  // ── Group CRUD ──

  const createGroup = async () => {
    if (!selectedDay) return;
    setSaving("new-group");

    const res = await fetch("/api/admin/tee-times", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, day_number: selectedDay.number }),
    });

    if (res.ok) {
      await fetchGroups(selectedDay.number);
    }
    setSaving(null);
  };

  const deleteGroup = (group: TeeTimeGroup) => {
    const teamMembers = group.scramble_team_id ? getTeamMembers(group.scramble_team_id) : [];
    const label = isScrambleDay && teamMembers.length > 0
      ? ` (${teamMembers.map((m) => m.display_name).join(", ")})`
      : group.players.length > 0
        ? ` (${group.players.map((p) => p.display_name).join(", ")})`
        : "";

    setConfirmModal({
      title: "Delete Group",
      message: `Delete this group${label}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/tee-times", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tee_time_id: group.id }),
        });
        if (selectedDay) await fetchGroups(selectedDay.number);
      },
    });
  };

  const updateGroup = async (groupId: string, field: string, value: string | number | null) => {
    setSaving(`${field}-${groupId}`);

    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, [field]: value } : g))
    );

    await fetch("/api/admin/tee-times", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_time_id: groupId, [field]: value }),
    });

    setSaving(null);
  };

  // ── Team assignment (scramble days) ──

  const assignTeam = async (groupId: string, teamId: string) => {
    setSaving(`assign-${teamId}`);

    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, scramble_team_id: teamId } : g))
    );

    await fetch("/api/admin/tee-times", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_time_id: groupId, scramble_team_id: teamId }),
    });

    setAddingToGroup(null);
    setSaving(null);
  };

  const unassignTeam = async (groupId: string) => {
    setSaving(`unassign-${groupId}`);

    // Optimistic update
    setGroups((prev) =>
      prev.map((g) => (g.id === groupId ? { ...g, scramble_team_id: null } : g))
    );

    await fetch("/api/admin/tee-times", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_time_id: groupId, scramble_team_id: null }),
    });

    setSaving(null);
  };

  // ── Player CRUD (non-scramble days) ──

  const addPlayer = async (groupId: string, userId: string) => {
    setSaving(`add-${userId}`);

    const player = unassigned.find((u) => u.user_id === userId);
    if (player) {
      setGroups((prev) =>
        prev.map((g) =>
          g.id === groupId
            ? {
                ...g,
                players: [
                  ...g.players,
                  { id: `temp-${userId}`, user_id: userId, display_name: player.display_name, avatar_url: player.avatar_url },
                ],
              }
            : g
        )
      );
      setUnassigned((prev) => prev.filter((u) => u.user_id !== userId));
    }

    const res = await fetch("/api/admin/tee-times/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_time_id: groupId, user_id: userId }),
    });

    if (!res.ok) {
      if (selectedDay) await fetchGroups(selectedDay.number);
    }

    setAddingToGroup(null);
    setSaving(null);
  };

  const removePlayer = async (groupId: string, player: TeeTimePlayer) => {
    setSaving(`remove-${player.user_id}`);

    setGroups((prev) =>
      prev.map((g) =>
        g.id === groupId
          ? { ...g, players: g.players.filter((p) => p.user_id !== player.user_id) }
          : g
      )
    );
    setUnassigned((prev) => [
      ...prev,
      { user_id: player.user_id, display_name: player.display_name, avatar_url: player.avatar_url },
    ]);

    const res = await fetch("/api/admin/tee-times/players", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tee_time_id: groupId, user_id: player.user_id }),
    });

    if (!res.ok) {
      if (selectedDay) await fetchGroups(selectedDay.number);
    }

    setSaving(null);
  };

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Day Selector View ──
  if (view === "days") {
    return (
      <div>
        <div className="space-y-2">
          {DAYS.map((day) => (
            <button
              key={day.number}
              onClick={async () => {
                setSelectedDay(day);
                setView("groups");
                setLoading(true);
                await fetchGroups(day.number);
                setLoading(false);
              }}
              className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                <span className="text-green-700 font-bold text-sm">
                  {dayCounts[day.number] || 0}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">
                  {day.label}
                </p>
                <p className="text-xs text-gray-400">
                  {day.sublabel}
                </p>
              </div>
              <svg className="w-4 h-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Groups View ──
  if (view === "groups" && selectedDay) {
    const unassignedTeams = getUnassignedTeams();

    return (
      <div>
        <button
          onClick={() => {
            setView("days");
            setSelectedDay(null);
            fetchDayCounts();
          }}
          className="flex items-center gap-1 text-green-700 text-sm font-medium mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">
          {selectedDay.label} Tee Times
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {selectedDay.sublabel}
        </p>

        {/* Unassigned banner — teams for scramble days, players for other days */}
        {isScrambleDay && unassignedTeams.length > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-4">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Unassigned Teams ({unassignedTeams.length})
            </p>
            <div className="space-y-1">
              {unassignedTeams.map((team) => (
                <div
                  key={team.id}
                  className="flex flex-wrap gap-1.5 px-2 py-1 bg-white rounded-lg border border-amber-200"
                >
                  {team.members.map((m) => (
                    <span
                      key={m.user_id}
                      className="inline-flex items-center gap-1 text-xs text-gray-700"
                    >
                      {m.avatar_url ? (
                        <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                      ) : (
                        <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
                          {(m.display_name || "?")[0].toUpperCase()}
                        </span>
                      )}
                      {m.display_name}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}

        {!isScrambleDay && unassigned.length > 0 && (
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
                  {player.avatar_url ? (
                    <img src={player.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                  ) : (
                    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
                      {(player.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}
                  {player.display_name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Groups */}
        <div className="space-y-3">
          {groups.map((group, index) => {
            const teamMembers = group.scramble_team_id ? getTeamMembers(group.scramble_team_id) : [];

            return (
              <div
                key={group.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Group header */}
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    Group {index + 1}
                  </span>
                  <button
                    onClick={() => deleteGroup(group)}
                    className="text-gray-300 hover:text-red-500 p-0.5"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Scramble day: team assignment */}
                {isScrambleDay && (
                  <div className="px-4 py-2">
                    {group.scramble_team_id ? (
                      <>
                        <div className="flex flex-wrap gap-1.5 py-1">
                          {teamMembers.map((member) => (
                            <span
                              key={member.user_id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full text-xs font-medium text-green-800"
                            >
                              {member.avatar_url ? (
                                <img src={member.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                              ) : (
                                <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-[8px] font-bold">
                                  {(member.display_name || "?")[0].toUpperCase()}
                                </span>
                              )}
                              {member.display_name}
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => unassignTeam(group.id)}
                          className="text-xs text-red-500 font-medium mt-1"
                        >
                          Remove Team
                        </button>
                      </>
                    ) : (
                      <div className="py-1">
                        {addingToGroup === group.id ? (
                          <div className="space-y-1 mt-1 mb-1">
                            {unassignedTeams.map((team) => (
                              <button
                                key={team.id}
                                onClick={() => assignTeam(group.id, team.id)}
                                disabled={saving !== null}
                                className="w-full flex flex-wrap items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-left text-sm"
                              >
                                {team.members.map((m) => (
                                  <span key={m.user_id} className="inline-flex items-center gap-1 text-xs text-gray-700">
                                    {m.avatar_url ? (
                                      <img src={m.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                                    ) : (
                                      <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
                                        {(m.display_name || "?")[0].toUpperCase()}
                                      </span>
                                    )}
                                    {m.display_name}
                                  </span>
                                ))}
                              </button>
                            ))}
                            <button
                              onClick={() => setAddingToGroup(null)}
                              className="text-xs text-gray-400 mt-1"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : unassignedTeams.length > 0 ? (
                          <button
                            onClick={() => setAddingToGroup(group.id)}
                            className="text-xs text-green-700 font-medium"
                          >
                            + Assign Team
                          </button>
                        ) : (
                          <p className="text-xs text-gray-400 italic">No teams available</p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Non-scramble day: individual players */}
                {!isScrambleDay && (
                  <div className="px-4 py-2">
                    {group.players.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-1">No players yet</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 py-1">
                        {group.players.map((player) => (
                          <span
                            key={player.user_id}
                            className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-50 rounded-full text-xs font-medium text-green-800"
                          >
                            {player.avatar_url ? (
                              <img src={player.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-[8px] font-bold">
                                {(player.display_name || "?")[0].toUpperCase()}
                              </span>
                            )}
                            {player.display_name}
                            <button
                              onClick={() => removePlayer(group.id, player)}
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

                    {unassigned.length > 0 && (
                      <div className="mt-1 mb-1">
                        {addingToGroup === group.id ? (
                          <div className="space-y-1 mt-2 mb-1">
                            {unassigned.map((player) => (
                              <button
                                key={player.user_id}
                                onClick={() => addPlayer(group.id, player.user_id)}
                                disabled={saving !== null}
                                className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 active:bg-gray-100 text-left text-sm"
                              >
                                {player.avatar_url ? (
                                  <img src={player.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                                ) : (
                                  <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[9px] font-bold">
                                    {(player.display_name || "?")[0].toUpperCase()}
                                  </span>
                                )}
                                <span className="text-gray-700">{player.display_name}</span>
                              </button>
                            ))}
                            <button
                              onClick={() => setAddingToGroup(null)}
                              className="text-xs text-gray-400 mt-1"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setAddingToGroup(group.id)}
                            className="text-xs text-green-700 font-medium"
                          >
                            + Add Player
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Tee Time & Starting Hole */}
                <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Tee Time
                    </label>
                    <input
                      type="time"
                      value={group.tee_time ?? ""}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        setGroups((prev) =>
                          prev.map((g) => (g.id === group.id ? { ...g, tee_time: val } : g))
                        );
                      }}
                      onBlur={(e) => {
                        const val = e.target.value || null;
                        updateGroup(group.id, "tee_time", val);
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Starting Hole
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={18}
                      value={group.starting_hole ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value);
                        setGroups((prev) =>
                          prev.map((g) => (g.id === group.id ? { ...g, starting_hole: val } : g))
                        );
                      }}
                      onBlur={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value);
                        updateGroup(group.id, "starting_hole", val);
                      }}
                      placeholder="—"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* New Group Button */}
        <button
          onClick={createGroup}
          disabled={saving === "new-group"}
          className="w-full mt-3 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 active:bg-gray-50 disabled:opacity-50"
        >
          {saving === "new-group" ? "Creating..." : "+ New Tee Time"}
        </button>

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

  return null;
}
