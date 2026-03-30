"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getTeeColorClasses } from "@/lib/tee-colors";
import { calcSkins } from "@/lib/skins";

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

interface HoleInfo {
  hole_number: number;
  par: number;
  yards: number;
  handicap_index: number;
  tee_color: string | null;
}

interface HoleScore {
  team_id: string;
  hole_number: number;
  strokes: number;
}

interface BonusPoint {
  team_id: string;
  hole_number: number;
  user_id: string;
  on_green: boolean;
  holed_out: boolean;
}

interface Contest {
  id: string;
  name: string;
  day_number: number | null;
  contest_type: string;
}

type Tab = "scores" | "bonus";
type SaveStatus = "idle" | "saving" | "saved" | "error";

export function ScoringManager({ tripId }: { tripId: string }) {
  const [contests, setContests] = useState<Contest[]>([]);
  const [selectedContestId, setSelectedContestId] = useState<string | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [holes, setHoles] = useState<HoleInfo[]>([]);
  const [holeScores, setHoleScores] = useState<Record<string, Record<number, number>>>({});
  const [bonusPoints, setBonusPoints] = useState<BonusPoint[]>([]);
  const [tab, setTab] = useState<Tab>("scores");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [loading, setLoading] = useState(true);
  const [selectedBonusTeamId, setSelectedBonusTeamId] = useState<string | null>(null);

  const [clearing, setClearing] = useState<"today" | "all" | null>(null);
  const [confirmClear, setConfirmClear] = useState<"today" | "all" | null>(null);

  const dirtyScoresRef = useRef<Map<string, { team_id: string; hole_number: number; strokes: number }>>(new Map());
  const dirtyBonusesRef = useRef<Map<string, BonusPoint>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch scramble contests for this trip
  const fetchContests = useCallback(async () => {
    const res = await fetch(`/api/admin/contests?trip_id=${tripId}`);
    const data = await res.json();
    const scrambles = (data.contests || []).filter(
      (c: { contest_type: string }) => c.contest_type === "scramble"
    );
    setContests(scrambles);
    return scrambles;
  }, [tripId]);

  // Fetch scoring data for a contest
  const fetchScoringData = useCallback(async (contestId: string) => {
    const res = await fetch(`/api/admin/scramble/scores?contest_id=${contestId}`);
    const data = await res.json();

    const fetchedTeams = data.teams || [];
    setTeams(fetchedTeams);
    setHoles(data.holes || []);
    setBonusPoints(data.bonus_points || []);

    // Set default bonus team
    if (fetchedTeams.length > 0) {
      setSelectedBonusTeamId(fetchedTeams[0].id);
    }

    // Transform scores array into Record<team_id, Record<hole_number, strokes>>
    const scoreMap: Record<string, Record<number, number>> = {};
    for (const s of (data.scores || []) as HoleScore[]) {
      if (!scoreMap[s.team_id]) scoreMap[s.team_id] = {};
      scoreMap[s.team_id][s.hole_number] = s.strokes;
    }
    setHoleScores(scoreMap);
  }, []);

  // Initialize
  useEffect(() => {
    async function init() {
      setLoading(true);
      const scrambles = await fetchContests();
      if (scrambles.length > 0) {
        const first = scrambles[0];
        setSelectedContestId(first.id);
        await fetchScoringData(first.id);
      }
      setLoading(false);
    }
    init();
  }, [fetchContests, fetchScoringData]);

  // Re-fetch when sibling ScrambleManager changes teams
  useEffect(() => {
    const handler = () => {
      if (selectedContestId) fetchScoringData(selectedContestId);
    };
    window.addEventListener("scramble-teams-changed", handler);
    return () => window.removeEventListener("scramble-teams-changed", handler);
  }, [selectedContestId, fetchScoringData]);

  // Flush saves
  const flushSaves = useCallback(async () => {
    const scoresToSave = Array.from(dirtyScoresRef.current.values());
    const bonusesToSave = Array.from(dirtyBonusesRef.current.values());

    if (scoresToSave.length === 0 && bonusesToSave.length === 0) return;

    dirtyScoresRef.current.clear();
    dirtyBonusesRef.current.clear();

    setSaveStatus("saving");

    try {
      const promises: Promise<Response>[] = [];

      if (scoresToSave.length > 0) {
        promises.push(
          fetch("/api/admin/scramble/scores", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scores: scoresToSave }),
          })
        );
      }

      if (bonusesToSave.length > 0) {
        promises.push(
          fetch("/api/admin/scramble/bonuses", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bonuses: bonusesToSave }),
          })
        );
      }

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (allOk) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        // Put entries back for retry
        for (const s of scoresToSave) {
          dirtyScoresRef.current.set(`${s.team_id}-${s.hole_number}`, s);
        }
        for (const b of bonusesToSave) {
          dirtyBonusesRef.current.set(`${b.team_id}-${b.hole_number}-${b.user_id}`, b);
        }
      }
    } catch {
      setSaveStatus("error");
      for (const s of scoresToSave) {
        dirtyScoresRef.current.set(`${s.team_id}-${s.hole_number}`, s);
      }
      for (const b of bonusesToSave) {
        dirtyBonusesRef.current.set(`${b.team_id}-${b.hole_number}-${b.user_id}`, b);
      }
    }
  }, []);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSaves, 500);
  }, [flushSaves]);

  // Flush on unmount
  useEffect(() => {
    const dirtyScores = dirtyScoresRef;
    const dirtyBonuses = dirtyBonusesRef;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      // Fire and forget flush on unmount
      const scoresToSave = Array.from(dirtyScores.current.values());
      const bonusesToSave = Array.from(dirtyBonuses.current.values());
      if (scoresToSave.length > 0) {
        fetch("/api/admin/scramble/scores", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scores: scoresToSave }),
        });
      }
      if (bonusesToSave.length > 0) {
        fetch("/api/admin/scramble/bonuses", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ bonuses: bonusesToSave }),
        });
      }
    };
  }, []);

  // Score change handler
  const handleScoreChange = (teamId: string, holeNumber: number, value: string) => {
    const strokes = value === "" ? undefined : parseInt(value);
    if (strokes !== undefined && (isNaN(strokes) || strokes < 1 || strokes > 20)) return;

    setHoleScores((prev) => {
      const teamScores = { ...(prev[teamId] || {}) };
      if (strokes === undefined) {
        delete teamScores[holeNumber];
      } else {
        teamScores[holeNumber] = strokes;
      }
      return { ...prev, [teamId]: teamScores };
    });

    if (strokes !== undefined) {
      dirtyScoresRef.current.set(`${teamId}-${holeNumber}`, {
        team_id: teamId,
        hole_number: holeNumber,
        strokes,
      });
      scheduleSave();
    }
  };

  // Bonus change handlers
  const handleOnGreenChange = (teamId: string, holeNumber: number, userId: string, checked: boolean) => {
    setBonusPoints((prev) => {
      const existing = prev.find(
        (b) => b.team_id === teamId && b.hole_number === holeNumber && b.user_id === userId
      );
      if (existing) {
        return prev.map((b) =>
          b.team_id === teamId && b.hole_number === holeNumber && b.user_id === userId
            ? { ...b, on_green: checked }
            : b
        );
      }
      return [...prev, { team_id: teamId, hole_number: holeNumber, user_id: userId, on_green: checked, holed_out: false }];
    });

    const existing = bonusPoints.find(
      (b) => b.team_id === teamId && b.hole_number === holeNumber && b.user_id === userId
    );
    const entry: BonusPoint = {
      team_id: teamId,
      hole_number: holeNumber,
      user_id: userId,
      on_green: checked,
      holed_out: existing?.holed_out || false,
    };
    dirtyBonusesRef.current.set(`${teamId}-${holeNumber}-${userId}`, entry);
    scheduleSave();
  };

  const handleHoledOutChange = (teamId: string, holeNumber: number, userId: string | null) => {
    setBonusPoints((prev) => {
      // Clear holed_out for all players on this hole/team
      let updated = prev.map((b) =>
        b.team_id === teamId && b.hole_number === holeNumber
          ? { ...b, holed_out: false }
          : b
      );

      if (userId) {
        const existing = updated.find(
          (b) => b.team_id === teamId && b.hole_number === holeNumber && b.user_id === userId
        );
        if (existing) {
          updated = updated.map((b) =>
            b.team_id === teamId && b.hole_number === holeNumber && b.user_id === userId
              ? { ...b, holed_out: true }
              : b
          );
        } else {
          updated.push({ team_id: teamId, hole_number: holeNumber, user_id: userId, on_green: false, holed_out: true });
        }
      }

      return updated;
    });

    // Mark all team members for this hole as dirty
    const team = teams.find((t) => t.id === teamId);
    if (team) {
      for (const member of team.members) {
        const isHoled = member.user_id === userId;
        const existing = bonusPoints.find(
          (b) => b.team_id === teamId && b.hole_number === holeNumber && b.user_id === member.user_id
        );
        const entry: BonusPoint = {
          team_id: teamId,
          hole_number: holeNumber,
          user_id: member.user_id,
          on_green: existing?.on_green || false,
          holed_out: isHoled,
        };
        dirtyBonusesRef.current.set(`${teamId}-${holeNumber}-${member.user_id}`, entry);
      }
    }
    scheduleSave();
  };

  // Day switch
  const handleDaySwitch = async (contestId: string) => {
    // Flush pending saves first
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    await flushSaves();

    setSelectedContestId(contestId);
    setSelectedBonusTeamId(null);
    setLoading(true);
    await fetchScoringData(contestId);
    setLoading(false);
  };

  // Clear scores
  const handleClear = async (mode: "today" | "all") => {
    setClearing(mode);
    try {
      const params = mode === "today"
        ? `mode=today&contest_id=${selectedContestId}`
        : `mode=all&trip_id=${tripId}`;
      const res = await fetch(`/api/admin/scramble/scores?${params}`, { method: "DELETE" });
      if (res.ok) {
        // Reset local state
        if (mode === "today" && selectedContestId) {
          setHoleScores({});
          setBonusPoints([]);
          setTeams((prev) => prev.map((t) => ({ ...t, gross_score: null })));
        } else {
          // Reload current contest data
          if (selectedContestId) {
            await fetchScoringData(selectedContestId);
          }
        }
      }
    } catch {
      // silent
    } finally {
      setClearing(null);
      setConfirmClear(null);
    }
  };

  // Helpers
  const getDayLabel = (dayNumber: number | null): string => {
    if (!dayNumber) return "?";
    const labels: Record<number, string> = { 2: "Thursday", 3: "Friday", 4: "Saturday" };
    return labels[dayNumber] || `Day ${dayNumber}`;
  };

  const getTeamLabel = (team: Team, index: number): string => {
    const names = team.members.length > 0
      ? team.members.map((m) => m.display_name).join(" / ")
      : `Team ${index + 1}`;
    return `${names} (${team.team_handicap > 0 ? `-${team.team_handicap}` : team.team_handicap})`;
  };

  const calcNine = (teamId: string, start: number, end: number): number | null => {
    const scores = holeScores[teamId];
    if (!scores) return null;
    let sum = 0;
    for (let h = start; h <= end; h++) {
      if (scores[h] === undefined) return null;
      sum += scores[h];
    }
    return sum;
  };

  const calcTotal = (teamId: string): number | null => {
    const out = calcNine(teamId, 1, 9);
    const inn = calcNine(teamId, 10, 18);
    if (out === null || inn === null) return null;
    return out + inn;
  };

  const parForNine = (start: number, end: number): number => {
    return holes
      .filter((h) => h.hole_number >= start && h.hole_number <= end)
      .reduce((sum, h) => sum + h.par, 0);
  };

  const totalPar = (): number => holes.reduce((sum, h) => sum + h.par, 0);

  const scoreColor = (strokes: number | undefined, par: number): string => {
    if (strokes === undefined) return "text-gray-400";
    if (strokes < par) return "text-green-700 font-bold";
    if (strokes > par) return "text-red-600 font-bold";
    return "text-gray-900";
  };

  const totalColor = (total: number | null, par: number): string => {
    if (total === null) return "text-gray-400";
    if (total < par) return "text-green-700 font-bold";
    if (total > par) return "text-red-600 font-bold";
    return "text-gray-900 font-bold";
  };

  // Loading
  if (loading && contests.length === 0) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (contests.length === 0) {
    return (
      <div className="text-center py-8 text-gray-400 text-sm">
        No scramble contests found. Add scramble contests first.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Day Selector */}
      <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
        {contests.map((c) => (
          <button
            key={c.id}
            onClick={() => handleDaySwitch(c.id)}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
              selectedContestId === c.id
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 active:bg-gray-200"
            }`}
          >
            {getDayLabel(c.day_number)}
          </button>
        ))}
      </div>

      {/* Save Status — always in DOM to avoid layout shift */}
      <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg transition-opacity duration-300 ${
        saveStatus === "idle" ? "opacity-0" :
        saveStatus === "saving" ? "opacity-100 bg-blue-50 text-blue-600" :
        saveStatus === "saved" ? "opacity-100 bg-green-50 text-green-600" :
        "opacity-100 bg-red-50 text-red-600"
      }`}>
        {saveStatus === "saving" ? (
          <>
            <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            Saving...
          </>
        ) : saveStatus === "saved" ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Saved
          </>
        ) : saveStatus === "error" ? (
          <>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Save failed — will retry
          </>
        ) : (
          /* Invisible placeholder to reserve height */
          <span>&nbsp;</span>
        )}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : teams.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Create scramble teams first.
        </div>
      ) : holes.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-sm">
          Set up tee assignments before entering scores.
        </div>
      ) : (
        <>
          {/* Tab Selector */}
          <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
            <button
              onClick={() => setTab("scores")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "scores"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 active:bg-gray-200"
              }`}
            >
              Scores
            </button>
            <button
              onClick={() => setTab("bonus")}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                tab === "bonus"
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 active:bg-gray-200"
              }`}
            >
              BSPITW Bonus
            </button>
          </div>

          {tab === "scores" ? (
            <ScoresGrid
              teams={teams}
              holes={holes}
              holeScores={holeScores}
              onScoreChange={handleScoreChange}
              getTeamLabel={getTeamLabel}
              calcNine={calcNine}
              calcTotal={calcTotal}
              parForNine={parForNine}
              totalPar={totalPar}
              scoreColor={scoreColor}
              totalColor={totalColor}
            />
          ) : (
            <BonusTab
              teams={teams}
              holes={holes}
              holeScores={holeScores}
              bonusPoints={bonusPoints}
              selectedTeamId={selectedBonusTeamId}
              onSelectTeam={setSelectedBonusTeamId}
              onOnGreenChange={handleOnGreenChange}
              onHoledOutChange={handleHoledOutChange}
              getTeamLabel={getTeamLabel}
            />
          )}
        </>
      )}

      {/* Clear Buttons */}
      {contests.length > 0 && (
        <div className="border-t border-gray-200 pt-4 mt-6 space-y-3">
          {confirmClear ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-3">
              <p className="text-sm text-red-800 font-medium">
                {confirmClear === "today"
                  ? "Clear all scores and bonus points for the current day?"
                  : "Clear all scores and bonus points for ALL days?"}
              </p>
              <p className="text-xs text-red-600">This cannot be undone.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleClear(confirmClear)}
                  disabled={clearing !== null}
                  className="flex-1 py-2 px-3 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 disabled:opacity-50"
                >
                  {clearing ? "Clearing..." : "Yes, Clear"}
                </button>
                <button
                  onClick={() => setConfirmClear(null)}
                  disabled={clearing !== null}
                  className="flex-1 py-2 px-3 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmClear("today")}
                className="flex-1 py-2.5 px-3 bg-white text-red-600 text-sm font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
              >
                Clear Today
              </button>
              <button
                onClick={() => setConfirmClear("all")}
                className="flex-1 py-2.5 px-3 bg-white text-red-600 text-sm font-medium rounded-xl border border-red-200 hover:bg-red-50 transition-colors"
              >
                Clear All Days
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Scores Grid ──

function ScoresGrid({
  teams,
  holes,
  holeScores,
  onScoreChange,
  getTeamLabel,
  calcNine,
  calcTotal,
  parForNine,
  totalPar,
  scoreColor,
  totalColor,
}: {
  teams: Team[];
  holes: HoleInfo[];
  holeScores: Record<string, Record<number, number>>;
  onScoreChange: (teamId: string, holeNumber: number, value: string) => void;
  getTeamLabel: (team: Team, index: number) => string;
  calcNine: (teamId: string, start: number, end: number) => number | null;
  calcTotal: (teamId: string) => number | null;
  parForNine: (start: number, end: number) => number;
  totalPar: () => number;
  scoreColor: (strokes: number | undefined, par: number) => string;
  totalColor: (total: number | null, par: number) => string;
}) {
  const frontNine = holes.filter((h) => h.hole_number <= 9).sort((a, b) => a.hole_number - b.hole_number);
  const backNine = holes.filter((h) => h.hole_number > 9).sort((a, b) => a.hole_number - b.hole_number);

  const { skinCounts, skinWins, totalSkins } = teams.length > 1
    ? calcSkins(teams, holes, holeScores)
    : { skinCounts: new Map<string, number>(), skinWins: new Map<string, Set<number>>(), totalSkins: 0 };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const inputs = Array.from(
        (e.currentTarget.closest("table") as HTMLTableElement).querySelectorAll<HTMLInputElement>("input[type='number']")
      );
      const currentIndex = inputs.indexOf(e.currentTarget);
      if (currentIndex >= 0 && currentIndex < inputs.length - 1) {
        inputs[currentIndex + 1].focus();
      }
    }
  };

  const renderHalf = (holesList: HoleInfo[], label: string, start: number, end: number) => (
    <div className="overflow-x-auto -mx-4 px-4">
      <table className="w-full border-collapse text-xs min-w-[500px]">
        <thead>
          <tr className="bg-gray-50">
            <th className="sticky left-0 bg-gray-50 z-10 px-2 py-1.5 text-left text-gray-500 font-semibold w-28 min-w-[112px]">
              Hole
            </th>
            {holesList.map((h) => {
              const colors = getTeeColorClasses(h.tee_color);
              return (
                <th key={h.hole_number} className="px-1 py-1.5 text-center font-semibold w-9 min-w-[36px]">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-md text-[10px] font-bold ${
                      colors.isCustom ? "" : colors.bg
                    } ${colors.text}`}
                    style={colors.isCustom ? { backgroundColor: colors.hex || undefined } : undefined}
                  >
                    {h.hole_number}
                  </span>
                </th>
              );
            })}
            <th className="px-1.5 py-1.5 text-center text-gray-500 font-bold w-10 min-w-[40px] bg-gray-100">
              {label}
            </th>
          </tr>
          <tr className="bg-gray-100/60">
            <td className="sticky left-0 bg-gray-100/60 z-10 px-2 py-1 text-gray-400 font-medium">Par</td>
            {holesList.map((h) => (
              <td key={h.hole_number} className="px-1 py-1 text-center text-gray-400 font-medium">
                {h.par}
              </td>
            ))}
            <td className="px-1.5 py-1 text-center text-gray-500 font-bold bg-gray-100">
              {parForNine(start, end)}
            </td>
          </tr>
          <tr className="bg-gray-50/50">
            <td className="sticky left-0 bg-gray-50/50 z-10 px-2 py-1 text-gray-400 font-medium">Hdcp</td>
            {holesList.map((h) => (
              <td key={h.hole_number} className="px-1 py-1 text-center text-gray-300 font-medium">
                {h.handicap_index || "—"}
              </td>
            ))}
            <td className="px-1.5 py-1 bg-gray-100" />
          </tr>
        </thead>
        <tbody>
          {teams.map((team, idx) => {
            const teamScores = holeScores[team.id] || {};
            const nineTotal = calcNine(team.id, start, end);
            const ninePar = parForNine(start, end);
            const teamSkinHoles = skinWins.get(team.id);
            return (
              <tr key={team.id} className={idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className={`sticky left-0 z-10 px-2 py-1.5 font-medium text-gray-700 truncate max-w-[112px] ${idx % 2 === 0 ? "bg-white" : "bg-gray-50"}`}>
                  {getTeamLabel(team, idx)}
                </td>
                {holesList.map((h) => {
                  const wonSkin = teamSkinHoles?.has(h.hole_number);
                  return (
                    <td key={h.hole_number} className="px-0.5 py-0.5 text-center">
                      <input
                        type="number"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        min={1}
                        max={20}
                        value={teamScores[h.hole_number] ?? ""}
                        onChange={(e) => onScoreChange(team.id, h.hole_number, e.target.value)}
                        onKeyDown={handleKeyDown}
                        onFocus={(e) => e.target.select()}
                        className={`w-8 h-7 text-center border border-gray-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-green-500 focus:border-green-500 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield] ${
                          wonSkin ? "ring-2 ring-green-500" : ""
                        } ${scoreColor(teamScores[h.hole_number], h.par)}`}
                      />
                    </td>
                  );
                })}
                <td className={`px-1.5 py-1.5 text-center text-sm ${totalColor(nineTotal, ninePar)} bg-gray-50`}>
                  {nineTotal ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-4">
      {frontNine.length > 0 && renderHalf(frontNine, "OUT", 1, 9)}
      {backNine.length > 0 && renderHalf(backNine, "IN", 10, 18)}

      {/* Totals */}
      {frontNine.length > 0 && backNine.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Team</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">OUT</th>
                  <th className="px-1 py-2 text-center text-gray-300">+</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">IN</th>
                  <th className="px-1 py-2 text-center text-gray-300">=</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">TOT</th>
                  <th className="px-1 py-2 text-center text-gray-300">−</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">HDCP</th>
                  <th className="px-1 py-2 text-center text-gray-300">=</th>
                  <th className="px-2 py-2 text-center text-gray-500 font-semibold">NET</th>
                  {teams.length > 1 && (
                    <th className="px-2 py-2 text-center text-gray-500 font-semibold">SKINS</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {teams.map((team, idx) => {
                  const out = calcNine(team.id, 1, 9);
                  const inn = calcNine(team.id, 10, 18);
                  const tot = calcTotal(team.id);
                  const par = totalPar();
                  const net = tot !== null ? tot - team.team_handicap : null;
                  const skins = skinCounts.get(team.id) || 0;
                  return (
                    <tr key={team.id}>
                      <td className="px-3 py-2 font-medium text-gray-700 truncate max-w-[140px]">
                        {getTeamLabel(team, idx)}
                      </td>
                      <td className={`px-2 py-2 text-center ${totalColor(out, parForNine(1, 9))}`}>
                        {out ?? "—"}
                      </td>
                      <td className="px-1 py-2 text-center text-gray-300">+</td>
                      <td className={`px-2 py-2 text-center ${totalColor(inn, parForNine(10, 18))}`}>
                        {inn ?? "—"}
                      </td>
                      <td className="px-1 py-2 text-center text-gray-300">=</td>
                      <td className={`px-2 py-2 text-center ${totalColor(tot, par)}`}>
                        {tot ?? "—"}
                      </td>
                      <td className="px-1 py-2 text-center text-gray-300">−</td>
                      <td className="px-2 py-2 text-center text-gray-500 font-medium">
                        {team.team_handicap}
                      </td>
                      <td className="px-1 py-2 text-center text-gray-300">=</td>
                      <td className={`px-2 py-2 text-center font-bold text-sm ${totalColor(net, par)}`}>
                        {net ?? "—"}
                      </td>
                      {teams.length > 1 && (
                        <td className="px-2 py-2 text-center font-bold">
                          {skins}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Bonus Tab ──

function BonusTab({
  teams,
  holes,
  holeScores,
  bonusPoints,
  selectedTeamId,
  onSelectTeam,
  onOnGreenChange,
  onHoledOutChange,
  getTeamLabel,
}: {
  teams: Team[];
  holes: HoleInfo[];
  holeScores: Record<string, Record<number, number>>;
  bonusPoints: BonusPoint[];
  selectedTeamId: string | null;
  onSelectTeam: (id: string) => void;
  onOnGreenChange: (teamId: string, holeNumber: number, userId: string, checked: boolean) => void;
  onHoledOutChange: (teamId: string, holeNumber: number, userId: string | null) => void;
  getTeamLabel: (team: Team, index: number) => string;
}) {
  const selectedTeam = teams.find((t) => t.id === selectedTeamId);
  const sortedHoles = [...holes].sort((a, b) => a.hole_number - b.hole_number);

  return (
    <div className="space-y-3">
      {/* Team selector */}
      <select
        value={selectedTeamId || ""}
        onChange={(e) => onSelectTeam(e.target.value)}
        className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm font-medium bg-white"
      >
        {teams.map((team, idx) => (
          <option key={team.id} value={team.id}>
            Team {idx + 1}: {getTeamLabel(team, idx)}
          </option>
        ))}
      </select>

      {selectedTeam && selectedTeam.members.length === 0 && (
        <div className="text-center py-6 text-gray-400 text-sm">
          This team has no members assigned.
        </div>
      )}

      {selectedTeam && selectedTeam.members.length > 0 && (
        <div className="space-y-2">
          {sortedHoles.map((hole) => {
            const teamScores = holeScores[selectedTeam.id] || {};
            const strokes = teamScores[hole.hole_number];
            const holeBonuses = bonusPoints.filter(
              (b) => b.team_id === selectedTeam.id && b.hole_number === hole.hole_number
            );
            const holedOutUserId = holeBonuses.find((b) => b.holed_out)?.user_id || null;

            return (
              <div key={hole.hole_number} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Hole header */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-100">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500">Hole {hole.hole_number}</span>
                    <span className="text-xs text-gray-400">Par {hole.par}</span>
                    {hole.yards > 0 && <span className="text-xs text-gray-400">{hole.yards}y</span>}
                  </div>
                  {strokes !== undefined && (
                    <span className={`text-xs font-bold ${
                      strokes < hole.par ? "text-green-600" :
                      strokes > hole.par ? "text-red-500" :
                      "text-gray-500"
                    }`}>
                      {strokes} ({strokes - hole.par >= 0 ? "+" : ""}{strokes - hole.par})
                    </span>
                  )}
                </div>

                {/* Player bonuses */}
                <div className="divide-y divide-gray-50">
                  {selectedTeam.members.map((member) => {
                    const bonus = holeBonuses.find((b) => b.user_id === member.user_id);
                    const isOnGreen = bonus?.on_green || false;
                    const isHoledOut = holedOutUserId === member.user_id;

                    return (
                      <div key={member.user_id} className="flex items-center gap-3 px-3 py-2">
                        <span className="flex-1 text-xs font-medium text-gray-700 truncate">
                          {member.display_name}
                        </span>

                        {/* On Green checkbox */}
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={isOnGreen}
                            onChange={(e) => onOnGreenChange(selectedTeam.id, hole.hole_number, member.user_id, e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <span className="text-[10px] text-gray-400 uppercase tracking-wide">Green</span>
                        </label>

                        {/* Holed Out radio */}
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            name={`holed-${selectedTeam.id}-${hole.hole_number}`}
                            checked={isHoledOut}
                            onChange={() => onHoledOutChange(selectedTeam.id, hole.hole_number, isHoledOut ? null : member.user_id)}
                            className="w-4 h-4 border-gray-300 text-green-600 focus:ring-green-500"
                          />
                          <span className="text-[10px] text-gray-400 uppercase tracking-wide">Holed</span>
                        </label>
                      </div>
                    );
                  })}

                  {/* None option for holed out */}
                  {holedOutUserId && (
                    <div className="flex items-center gap-3 px-3 py-1.5">
                      <span className="flex-1" />
                      <button
                        onClick={() => onHoledOutChange(selectedTeam.id, hole.hole_number, null)}
                        className="text-[10px] text-gray-400 underline"
                      >
                        Clear holed out
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
