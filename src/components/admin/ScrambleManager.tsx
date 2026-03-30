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
  team_handicap: number;
  gross_score: number | null;
  course_par: number;
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
  day_number: number | null;
  team_count: number;
}

type View = "days" | "teams";

export function ScrambleManager({ tripId }: { tripId: string }) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContest, setSelectedContest] = useState<Contest | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unassigned, setUnassigned] = useState<UnassignedPlayer[]>([]);
  const [participantCount, setParticipantCount] = useState(0);
  const [coursePar, setCoursePar] = useState(72);
  const [view, setView] = useState<View>("days");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [drawerTeamId, setDrawerTeamId] = useState<string | null>(null);
  const [drawerSelections, setDrawerSelections] = useState<Set<string>>(new Set());
  const [unassignedSelections, setUnassignedSelections] = useState<Set<string>>(new Set());
  const [showRealNames, setShowRealNames] = useState(false);
  const [participantDrawerOpen, setParticipantDrawerOpen] = useState(false);
  const [attendees, setAttendees] = useState<{ id: string; display_name: string; full_name: string | null; avatar_url: string | null; is_participating: boolean }[]>([]);
  const [participantIds, setParticipantIds] = useState<Set<string>>(new Set());

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
    setParticipantCount(data.participant_count ?? 0);
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

  const createTeam = async (preSelectedIds?: string[]) => {
    if (!selectedContest) return;
    setSaving("new-team");

    const res = await fetch("/api/admin/scramble", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, course_par: coursePar }),
    });

    if (res.ok) {
      const { team } = await res.json();

      // If players were pre-selected, batch-add them to the new team
      if (preSelectedIds && preSelectedIds.length > 0 && team?.id) {
        await fetch("/api/admin/scramble/members", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: team.id, user_ids: preSelectedIds }),
        });
      }

      await Promise.all([fetchTeams(selectedContest.id), fetchContests()]);
      window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
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
        if (selectedContest) {
          await Promise.all([fetchTeams(selectedContest.id), fetchContests()]);
          window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
        }
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
    window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
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

    const res = await fetch("/api/admin/scramble/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_id: userId }),
    });

    if (!res.ok) {
      // Revert
      if (selectedContest) await fetchTeams(selectedContest.id);
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

    const res = await fetch("/api/admin/scramble/members", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_id: member.user_id }),
    });

    if (!res.ok) {
      if (selectedContest) await fetchTeams(selectedContest.id);
    } else {
      window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
    }

    setSaving(null);
  };

  // ── Drawer helpers ──

  const openDrawer = (teamId: string) => {
    setDrawerTeamId(teamId);
    setDrawerSelections(new Set());
  };

  const toggleDrawerSelection = (userId: string) => {
    setDrawerSelections((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const closeDrawer = async () => {
    const teamId = drawerTeamId;
    const selectedIds = Array.from(drawerSelections);
    setDrawerTeamId(null);
    setDrawerSelections(new Set());

    if (!teamId || selectedIds.length === 0) return;

    // Optimistic: move all selected players to the team at once
    const players = selectedIds
      .map((uid) => unassigned.find((u) => u.user_id === uid))
      .filter(Boolean) as typeof unassigned;

    if (players.length > 0) {
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? {
                ...t,
                members: [
                  ...t.members,
                  ...players.map((p) => ({
                    id: `temp-${p.user_id}`,
                    user_id: p.user_id,
                    display_name: p.display_name,
                    full_name: p.full_name,
                    avatar_url: p.avatar_url,
                  })),
                ],
              }
            : t
        )
      );
      setUnassigned((prev) => prev.filter((u) => !drawerSelections.has(u.user_id)));
    }

    // Single batch API call
    const res = await fetch("/api/admin/scramble/members", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ team_id: teamId, user_ids: selectedIds }),
    });

    if (!res.ok) {
      // Revert on failure
      if (selectedContest) await fetchTeams(selectedContest.id);
    } else {
      window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
    }
  };

  // ── Participant drawer helpers ──

  const openParticipantDrawer = async () => {
    if (!selectedContest) return;
    // Fetch attendees and current contest participants in parallel
    const [attendeesRes, participantsRes] = await Promise.all([
      fetch(`/api/admin/participants?trip_id=${tripId}`),
      fetch(`/api/admin/contests/participants?contest_id=${selectedContest.id}`),
    ]);
    const attendeesData = await attendeesRes.json();
    const participantsData = await participantsRes.json();

    const allAttendees = (attendeesData.users || []).filter(
      (u: { is_participating: boolean }) => u.is_participating
    );
    setAttendees(allAttendees);

    const ids = new Set<string>(
      (participantsData.participants || []).map((p: { user_id: string }) => p.user_id)
    );
    setParticipantIds(ids);
    setParticipantDrawerOpen(true);
  };

  const toggleParticipant = async (userId: string) => {
    if (!selectedContest) return;
    const isIn = participantIds.has(userId);

    // Optimistic
    setParticipantIds((prev) => {
      const next = new Set(prev);
      if (isIn) next.delete(userId);
      else next.add(userId);
      return next;
    });

    // If removing, also remove from any scramble team they're on
    let teamId: string | null = null;
    if (isIn) {
      const team = teams.find((t) => t.members.some((m) => m.user_id === userId));
      if (team) {
        teamId = team.id;
        // Optimistic: remove from team, add to unassigned
        const member = team.members.find((m) => m.user_id === userId);
        setTeams((prev) =>
          prev.map((t) =>
            t.id === teamId
              ? { ...t, members: t.members.filter((m) => m.user_id !== userId) }
              : t
          )
        );
        if (member) {
          setUnassigned((prev) => [
            ...prev,
            { user_id: member.user_id, display_name: member.display_name, full_name: member.full_name, avatar_url: member.avatar_url },
          ]);
        }
      }
    }

    const promises: Promise<Response>[] = [
      fetch("/api/admin/contests/participants", {
        method: isIn ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_id: selectedContest.id, user_id: userId }),
      }),
    ];

    if (teamId) {
      promises.push(
        fetch("/api/admin/scramble/members", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: teamId, user_id: userId }),
        })
      );
    }

    const results = await Promise.all(promises);

    if (!results[0].ok) {
      // Revert participant toggle
      setParticipantIds((prev) => {
        const next = new Set(prev);
        if (isIn) next.add(userId);
        else next.delete(userId);
        return next;
      });
      // Revert team removal by re-fetching
      if (teamId && selectedContest) await fetchTeams(selectedContest.id);
    } else if (teamId) {
      window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
    }
  };

  const selectAllParticipants = async () => {
    if (!selectedContest) return;
    const allIds = attendees.map((u) => u.id);
    setParticipantIds(new Set(allIds));
    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, user_ids: allIds }),
    });
  };

  const deselectAllParticipants = async () => {
    if (!selectedContest) return;
    setParticipantIds(new Set());

    // Remove all team members first
    const removePromises = teams.flatMap((t) =>
      t.members.map((m) =>
        fetch("/api/admin/scramble/members", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_id: t.id, user_id: m.user_id }),
        })
      )
    );
    if (removePromises.length > 0) await Promise.all(removePromises);

    await fetch("/api/admin/contests/participants", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: selectedContest.id, user_ids: [] }),
    });

    if (removePromises.length > 0) {
      window.dispatchEvent(new CustomEvent("scramble-teams-changed"));
    }
  };

  const closeParticipantDrawer = async () => {
    setParticipantDrawerOpen(false);
    // Refresh teams to reflect participant changes
    if (selectedContest) {
      await fetchTeams(selectedContest.id);
    }
  };

  // ── Name helpers ──

  const getName = (player: { display_name: string; full_name: string | null }) =>
    showRealNames && player.full_name ? player.full_name : player.display_name;

  const sortByName = <T extends { display_name: string; full_name: string | null }>(list: T[]) =>
    [...list].sort((a, b) => getName(a).localeCompare(getName(b)));

  // ── Helpers ──

  function calcNetScore(team: Team): number | null {
    if (team.gross_score === null || team.gross_score === undefined) return null;
    return team.gross_score - team.team_handicap;
  }

  function calcScoreVsPar(team: Team): number | null {
    const net = calcNetScore(team);
    if (net === null) return null;
    return net - team.course_par;
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
                  {contest.team_count}
                </span>
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-900 text-sm">
                  {contest.name}
                </p>
                <p className="text-xs text-gray-400">
                  {getDayLabel(contest.day_number)} · {contest.team_count} team{contest.team_count !== 1 ? "s" : ""}
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
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm text-gray-500">
            {getDayLabel(selectedContest.day_number)} · Par {coursePar}
          </p>
          {participantCount > 0 && (
            <button
              onClick={openParticipantDrawer}
              className="text-xs text-green-700 font-medium"
            >
              Edit Participants ({participantCount})
            </button>
          )}
        </div>

        {/* No participants warning */}
        {participantCount === 0 && teams.length === 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 mb-4 text-center">
            <p className="text-sm font-medium text-amber-800 mb-1">
              No players are participating in this contest yet.
            </p>
            <p className="text-xs text-amber-600 mb-3">
              Choose who&apos;s playing this day.
            </p>
            <button
              onClick={openParticipantDrawer}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700"
            >
              Select Participants
            </button>
          </div>
        )}

        {/* Unassigned Players */}
        {unassigned.length > 0 && (
          <div className="bg-amber-50 rounded-xl border border-amber-200 p-3 mb-2">
            <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
              Unassigned ({unassigned.length})
              {unassignedSelections.size > 0 && (
                <span className="text-green-700 ml-1">· {unassignedSelections.size} selected</span>
              )}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {sortByName(unassigned).map((player) => {
                const selected = unassignedSelections.has(player.user_id);
                return (
                  <button
                    key={player.user_id}
                    onClick={() => {
                      setUnassignedSelections((prev) => {
                        const next = new Set(prev);
                        if (next.has(player.user_id)) next.delete(player.user_id);
                        else next.add(player.user_id);
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                      selected
                        ? "bg-green-100 text-green-800 border-green-400"
                        : "bg-white text-gray-700 border-amber-200 active:bg-amber-100"
                    }`}
                  >
                    {player.avatar_url ? (
                      <img src={player.avatar_url} alt="" className="w-4 h-4 rounded-full object-cover" />
                    ) : (
                      <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold">
                        {(player.display_name || "?")[0].toUpperCase()}
                      </span>
                    )}
                    {getName(player)}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* New Team Button */}
        {unassigned.length > 0 && <button
          onClick={() => {
            const selected = Array.from(unassignedSelections);
            setUnassignedSelections(new Set());
            createTeam(selected.length > 0 ? selected : undefined);
          }}
          disabled={saving === "new-team"}
          className={`w-full mb-4 py-3 border-2 border-dashed rounded-xl text-sm font-medium active:bg-gray-50 disabled:opacity-50 ${
            unassignedSelections.size > 0
              ? "border-green-400 text-green-700 bg-green-50"
              : "border-gray-300 text-gray-500"
          }`}
        >
          {saving === "new-team"
            ? "Creating..."
            : unassignedSelections.size > 0
              ? `+ New Team with ${unassignedSelections.size} Player${unassignedSelections.size !== 1 ? "s" : ""}`
              : "+ New Team"}
        </button>}

        {/* Teams */}
        <div className="space-y-3">
          {teams.map((team, index) => {
            const scoreVsPar = calcScoreVsPar(team);
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
                    {scoreVsPar !== null && (
                      <span className={`text-sm font-bold ${scoreVsPar < 0 ? "text-green-700" : scoreVsPar > 0 ? "text-red-600" : "text-gray-700"}`}>
                        {scoreVsPar < 0 ? scoreVsPar : scoreVsPar > 0 ? `+${scoreVsPar}` : "E"}
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

                  {/* Add Players */}
                  {unassigned.length > 0 && (
                    <div className="mt-1 mb-1">
                      <button
                        onClick={() => openDrawer(team.id)}
                        className="text-xs text-green-700 font-medium"
                      >
                        + Add Players
                      </button>
                    </div>
                  )}
                </div>

                {/* Scoring */}
                <div className="px-4 py-2.5 border-t border-gray-100 flex items-center gap-3">
                  <div className="flex-1">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Hdcp
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
                  <div className="flex-1 text-center">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Gross
                    </label>
                    <div className="text-sm font-medium text-gray-700">
                      {team.gross_score ?? "—"}
                    </div>
                  </div>
                  <div className="flex-1 text-center">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      Net
                    </label>
                    <div className="text-sm font-medium text-gray-700">
                      {calcNetScore(team) ?? "—"}
                    </div>
                  </div>
                  <div className="flex-1 text-center">
                    <label className="block text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">
                      vs Par
                    </label>
                    <div className={`text-lg font-bold ${scoreVsPar !== null ? (scoreVsPar < 0 ? "text-green-700" : scoreVsPar > 0 ? "text-red-600" : "text-gray-700") : "text-gray-300"}`}>
                      {scoreVsPar !== null ? (scoreVsPar < 0 ? scoreVsPar : scoreVsPar > 0 ? `+${scoreVsPar}` : "E") : "—"}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

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
          title={`Add to Team ${drawerTeamId ? teams.findIndex((t) => t.id === drawerTeamId) + 1 : ""}`}
          subtitle={`${drawerSelections.size} selected · ${unassigned.length} available`}
        >
          <div className="flex items-center justify-end px-4 py-2 border-b border-gray-100">
            <button
              onClick={() => setShowRealNames(!showRealNames)}
              className="text-xs text-green-700 font-medium"
            >
              Show {showRealNames ? "nicknames" : "real names"}
            </button>
          </div>
          {sortByName(unassigned).map((player) => {
            const selected = drawerSelections.has(player.user_id);
            return (
              <button
                key={player.user_id}
                onClick={() => toggleDrawerSelection(player.user_id)}
                className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                  selected ? "bg-green-50" : "active:bg-gray-50"
                }`}
              >
                <div className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                  selected ? "border-green-600 bg-green-600" : "border-gray-300"
                }`}>
                  {selected && (
                    <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  )}
                </div>
                {player.avatar_url ? (
                  <img src={player.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                    {getName(player)[0].toUpperCase()}
                  </span>
                )}
                <span className="text-sm font-medium text-gray-900">{getName(player)}</span>
              </button>
            );
          })}
        </BottomDrawer>

        <BottomDrawer
          open={participantDrawerOpen}
          onClose={closeParticipantDrawer}
          title="Participants"
          subtitle={`${participantIds.size} of ${attendees.length} attendees`}
        >
          <div className="flex gap-2 px-4 py-2 items-center border-b border-gray-100">
            <button
              onClick={selectAllParticipants}
              className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
            >
              All
            </button>
            <button
              onClick={deselectAllParticipants}
              className="text-xs text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50"
            >
              None
            </button>
            <div className="flex-1" />
            <button
              onClick={() => setShowRealNames(!showRealNames)}
              className="text-xs text-green-700 font-medium"
            >
              Show {showRealNames ? "nicknames" : "real names"}
            </button>
          </div>
          {[...attendees]
            .sort((a, b) => getName(a).localeCompare(getName(b)))
            .map((user) => {
              const inContest = participantIds.has(user.id);
              return (
                <button
                  key={user.id}
                  onClick={() => toggleParticipant(user.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                    inContest ? "bg-green-50" : "active:bg-gray-50"
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                      inContest ? "border-green-600 bg-green-600" : "border-gray-300"
                    }`}
                  >
                    {inContest && (
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  {user.avatar_url ? (
                    <img src={user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <span className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-sm font-bold">
                      {getName(user)[0].toUpperCase()}
                    </span>
                  )}
                  <span className="text-sm font-medium text-gray-900">{getName(user)}</span>
                </button>
              );
            })}
        </BottomDrawer>
      </div>
    );
  }

  return null;
}
