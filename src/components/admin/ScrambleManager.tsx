"use client";

import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface TeamMember {
  id: string;
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface Team {
  id: string;
  contest_id: string;
  team_handicap: number;
  gross_score: number | null;
  course_par: number;
  members: TeamMember[];
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

type View = "days" | "teams";

export function ScrambleManager({ tripId }: { tripId: string }) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedPlayer[]>([]);
  const [coursePar, setCoursePar] = useState(72);
  const [view, setView] = useState<View>("days");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [addingToTeam, setAddingToTeam] = useState<string | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Fetch scramble contests for this trip
  const fetchContests = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const scrambles = (data.contests || []).filter(
      (c: { contest_type: string }) => c.contest_type === "scramble"
    );
    setContests(scrambles);
  }, [tripId]);

  // Fetch teams for a contest
  const fetchTeams = useCallback(async (contestId: string) => {
    const res = await fetch(`/api/admin/scramble?contest_id=${contestId}`);
    const data = await res.json();
    setTeams(data.teams || []);
    setUnassigned(data.unassigned || []);
    if (data.course_par) setCoursePar(data.course_par);
  }, []);

  useEffect(() => {
    async function init() {
      setLoading(true);
      await fetchContests();
      setLoading(false);
    }
    init();
  }, [fetchContests]);

  // ── Team CRUD ──

  const createTeam = async () => {
    if (!selectedContest) return;
    setSaving("new-team");

    const res = await fetch("/api/admin/scramble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, course_par: coursePar }),
    });

    if (res.ok) {
      await fetchTeams(selectedContest.id);
    }
    setSaving(null);
  };

  const deleteTeam = (team: Team) => {
    setConfirmModal({
      title: "Delete Team",
      message: `Delete this team${team.members.length > 0 ? ` (${team.members.map((m) => m.display_name).join(", ")})` : ""}? This cannot be undone.`,
      onConfirm: async () => {
        setConfirmModal(null);
        await fetch("/api/admin/scramble", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: team.id }),
        });
        if (selectedContest) await fetchTeams(selectedContest.id);
      },
    });
  };

  const updateTeam = async (teamId: string, field: string, value: number | null) => {
    setSaving(`${field}-${teamId}`);

    // Optimistic update
    setTeams((prev) =>
      prev.map((t) => (t.id === teamId ? { ...t, [field]: value } : t))
    );

    await fetch("/api/admin/scramble", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, [field]: value }),
    });

    setSaving(null);
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
                  { id: `temp-${userId}`, user_id: userId, display_name: player.display_name, avatar_url: player.avatar_url },
                ],
              }
            : t
        )
      );
      setUnassigned((prev) => prev.filter((u) => u.user_id !== userId));
    }

    const res = await fetch("/api/admin/scramble/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_id: userId }),
    });

    if (!res.ok) {
      // Revert
      if (selectedContest) await fetchTeams(selectedContest.id);
    }

    setAddingToTeam(null);
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
      { user_id: member.user_id, display_name: member.display_name, avatar_url: member.avatar_url },
    ]);

    const res = await fetch("/api/admin/scramble/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_id: member.user_id }),
    });

    if (!res.ok) {
      if (selectedContest) await fetchTeams(selectedContest.id);
    }

    setSaving(null);
  };

  // ── Helpers ──

  function calcPoints(team: Team): number | null {
    if (team.gross_score === null || team.gross_score === undefined) return null;
    return (team.course_par - team.gross_score) + team.team_handicap;
  }

  function getDayLabel(dayNumber: number | null): string {
    if (!dayNumber) return "Unknown";
    const dayNames: Record<number, string> = { 2: "Day 2 (Thu)", 3: "Day 3 (Fri)", 4: "Day 4 (Sat)" };
    return dayNames[dayNumber] || `Day ${dayNumber}`;
  }

  // ── Loading ──

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (contests.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No scramble contests found. Add scramble contests in the Roster section first.
      </div>
    );
  }

  // ── Day Selector View ──
  if (view === "days") {
    return (
      <div>
        <div className="space-y-2">
          {contests.map((contest) => (
            <button
              key={contest.id}
              onClick={async () => {
                setSelectedContest(contest);
                setView("teams");
                setLoading(true);
                await fetchTeams(contest.id);
                setLoading(false);
              }}
              className="w-full bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center gap-3 active:bg-gray-50 transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-full bg-green-50 flex items-center justify-center flex-shrink-0">
                <span className="text-green-700 font-bold text-sm">
                  {contest.day_number || "?"}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">
                  {contest.name}
                </p>
                <p className="text-xs text-gray-400">
                  {getDayLabel(contest.day_number)}
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

  // ── Teams View ──
  if (view === "teams" && selectedContest) {
    return (
      <div>
        <button
          onClick={() => {
            setView("days");
            setSelectedContest(null);
          }}
          className="flex items-center gap-1 text-green-700 text-sm font-medium mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <h2 className="text-lg font-bold text-gray-900 mb-1">
          {selectedContest.name}
        </h2>
        <p className="text-sm text-gray-500 mb-4">
          {getDayLabel(selectedContest.day_number)} · Par {coursePar}
        </p>

        {/* Unassigned Players */}
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

        {/* Teams */}
        <div className="space-y-3">
          {teams.map((team, index) => {
            const points = calcPoints(team);
            return (
              <div
                key={team.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                {/* Team header */}
                <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-sm font-semibold text-gray-700">
                    Team {index + 1}
                  </span>
                  <div className="flex items-center gap-2">
                    {points !== null && (
                      <span className={`text-sm font-bold ${points >= 0 ? "text-green-700" : "text-red-600"}`}>
                        {points > 0 ? "+" : ""}{points} pts
                      </span>
                    )}
                    <button
                      onClick={() => deleteTeam(team)}
                      className="text-gray-300 hover:text-red-500 p-0.5"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
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
                            <span className="w-4 h-4 rounded-full bg-green-200 flex items-center justify-center text-green-700 text-[8px] font-bold">
                              {(member.display_name || "?")[0].toUpperCase()}
                            </span>
                          )}
                          {member.display_name}
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

                  {/* Add Player */}
                  {unassigned.length > 0 && (
                    <div className="mt-1 mb-1">
                      {addingToTeam === team.id ? (
                        <div className="space-y-1 mt-2 mb-1">
                          {unassigned.map((player) => (
                            <button
                              key={player.user_id}
                              onClick={() => addMember(team.id, player.user_id)}
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
                            onClick={() => setAddingToTeam(null)}
                            className="text-xs text-gray-400 mt-1"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setAddingToTeam(team.id)}
                          className="text-xs text-green-700 font-medium"
                        >
                          + Add Player
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* Scoring */}
                <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Handicap
                    </label>
                    <input
                      type="number"
                      value={team.team_handicap}
                      onChange={(e) => {
                        const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                        setTeams((prev) =>
                          prev.map((t) => (t.id === team.id ? { ...t, team_handicap: val } : t))
                        );
                      }}
                      onBlur={(e) => {
                        const val = e.target.value === "" ? 0 : parseInt(e.target.value);
                        updateTeam(team.id, "team_handicap", val);
                      }}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Gross Score
                    </label>
                    <input
                      type="number"
                      value={team.gross_score ?? ""}
                      onChange={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value);
                        setTeams((prev) =>
                          prev.map((t) => (t.id === team.id ? { ...t, gross_score: val } : t))
                        );
                      }}
                      onBlur={(e) => {
                        const val = e.target.value === "" ? null : parseInt(e.target.value);
                        updateTeam(team.id, "gross_score", val);
                      }}
                      placeholder="—"
                      className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm text-center"
                    />
                  </div>
                  <div className="flex-1 text-center">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Points
                    </label>
                    <div className={`text-lg font-bold ${points !== null ? (points >= 0 ? "text-green-700" : "text-red-600") : "text-gray-300"}`}>
                      {points !== null ? (points > 0 ? `+${points}` : points) : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* New Team Button */}
        <button
          onClick={createTeam}
          disabled={saving === "new-team"}
          className="w-full mt-3 py-3 border-2 border-dashed border-gray-300 rounded-xl text-sm font-medium text-gray-500 active:bg-gray-50 disabled:opacity-50"
        >
          {saving === "new-team" ? "Creating..." : "+ New Team"}
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
