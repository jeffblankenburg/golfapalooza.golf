"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { logActivity } from "@/components/ActivityTracker";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

type SaveStatus = "idle" | "saving" | "saved" | "error";

interface TeamInfo {
  id: string;
  team_handicap: number;
  course_par: number;
  contest_id: string;
  verified_at: string | null;
}

interface Member {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface HoleScore {
  hole_number: number;
  strokes: number;
}

interface BonusPoint {
  hole_number: number;
  user_id: string;
  on_green: boolean;
  holed_out: boolean;
}

interface LeaderboardEntry {
  team_id: string;
  members: string[];
  team_handicap: number;
  holes_completed: number;
  gross_so_far: number;
  par_through: number;
  rel_par: number;
}

interface Props {
  team: TeamInfo;
  members: Member[];
  startingHole: number;
  holes: HoleInfo[];
  initialScores: HoleScore[];
  initialBonusPoints: BonusPoint[];
  currentUserId: string;
  scoringClosed?: boolean;
  contestVerified?: boolean;
}

function formatRelPar(relPar: number): string {
  if (relPar === 0) return "E";
  if (relPar > 0) return `+${relPar}`;
  return `${relPar}`;
}

// ── LeaderboardPopup ──────────────────────────────────────────────────────

function LeaderboardPopup({
  contestId,
  currentTeamId,
  onClose,
}: {
  contestId: string;
  currentTeamId: string;
  onClose: () => void;
}) {
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [dayName, setDayName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/scoring/leaderboard?contest_id=${contestId}`
      );
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        if (data.day_name) setDayName(data.day_name);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-6 animate-slide-up max-h-[70vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
        <h2 className="text-lg font-bold text-gray-900 text-center mb-4">
          {dayName ? `${dayName} Leaderboard` : "Leaderboard"}
        </h2>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : leaderboard.length === 0 ? (
          <p className="text-center text-gray-400 py-8 text-sm">
            No scores yet
          </p>
        ) : (
          <div className="space-y-2">
            {leaderboard.map((entry, i) => {
              const isMe = entry.team_id === currentTeamId;
              return (
                <div
                  key={entry.team_id}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl ${
                    isMe ? "bg-green-50 border border-green-200" : "bg-gray-50"
                  }`}
                >
                  <span className="text-sm font-bold text-gray-400 w-6 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p
                      className={`text-sm font-medium truncate ${
                        isMe ? "text-green-800" : "text-gray-900"
                      }`}
                    >
                      {entry.members.join(", ")}
                    </p>
                    <p className="text-xs text-gray-400">
                      thru {entry.holes_completed}
                    </p>
                  </div>
                  <span
                    className={`text-lg font-bold ${
                      entry.rel_par < 0
                        ? "text-green-700"
                        : entry.rel_par > 0
                        ? "text-red-600"
                        : "text-gray-900"
                    }`}
                  >
                    {entry.holes_completed > 0
                      ? formatRelPar(entry.rel_par)
                      : "\u00b7"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ── LiveScorer ────────────────────────────────────────────────────────────

export function LiveScorer({
  team,
  members,
  startingHole,
  holes,
  initialScores,
  initialBonusPoints,
  currentUserId,
  scoringClosed = false,
  contestVerified = false,
}: Props) {
  const router = useRouter();
  const isVerified = !!team.verified_at;
  const isLocked = scoringClosed || isVerified;

  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showLeaderboard, setShowLeaderboard] = useState(false);

  // Track current hole via ref so score panel always has access without re-rendering the shell
  const currentHoleRef = useRef<HoleInfo>(
    holes[Math.max(0, holes.findIndex((h) => h.hole_number === startingHole))]
  );

  // Scores: hole_number -> strokes
  const [scores, setScores] = useState<Record<number, number>>(() => {
    const map: Record<number, number> = {};
    for (const s of initialScores) map[s.hole_number] = s.strokes;
    return map;
  });

  // Bonus points: "hole_number-user_id" -> { on_green, holed_out }
  const [bonuses, setBonuses] = useState<
    Record<string, { on_green: boolean; holed_out: boolean }>
  >(() => {
    const map: Record<string, { on_green: boolean; holed_out: boolean }> = {};
    for (const b of initialBonusPoints) {
      map[`${b.hole_number}-${b.user_id}`] = {
        on_green: b.on_green,
        holed_out: b.holed_out,
      };
    }
    return map;
  });

  // Dirty tracking refs
  const dirtyScoresRef = useRef<
    Map<number, { hole_number: number; strokes: number }>
  >(new Map());
  const dirtyBonusesRef = useRef<
    Map<string, { hole_number: number; user_id: string; on_green: boolean; holed_out: boolean }>
  >(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Save Logic ──

  const flushSaves = useCallback(async () => {
    const scoresToSave = Array.from(dirtyScoresRef.current.values());
    const bonusesToSave = Array.from(dirtyBonusesRef.current.values());

    if (scoresToSave.length === 0 && bonusesToSave.length === 0) return;

    dirtyScoresRef.current.clear();
    dirtyBonusesRef.current.clear();

    setSaveStatus("saving");

    try {
      const promises: Promise<Response>[] = [];

      for (const s of scoresToSave) {
        promises.push(
          fetch("/api/scoring/hole", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              team_id: team.id,
              hole_number: s.hole_number,
              strokes: s.strokes,
            }),
          })
        );
      }

      for (const b of bonusesToSave) {
        promises.push(
          fetch("/api/scoring/bonus", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              team_id: team.id,
              hole_number: b.hole_number,
              user_id: b.user_id,
              on_green: b.on_green,
              holed_out: b.holed_out,
            }),
          })
        );
      }

      const results = await Promise.all(promises);
      const allOk = results.every((r) => r.ok);

      if (allOk) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
        logActivity("score_save", "/scoring", {
          team_id: team.id,
          holes: scoresToSave.map((s) => s.hole_number),
          bonuses: bonusesToSave.length,
        });
      } else {
        setSaveStatus("error");
        for (const s of scoresToSave) {
          dirtyScoresRef.current.set(s.hole_number, s);
        }
        for (const b of bonusesToSave) {
          dirtyBonusesRef.current.set(`${b.hole_number}-${b.user_id}`, b);
        }
      }
    } catch {
      setSaveStatus("error");
      for (const s of scoresToSave) {
        dirtyScoresRef.current.set(s.hole_number, s);
      }
      for (const b of bonusesToSave) {
        dirtyBonusesRef.current.set(`${b.hole_number}-${b.user_id}`, b);
      }
    }
  }, [team.id]);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSaves, 600);
  }, [flushSaves]);

  // Flush on unmount
  useEffect(() => {
    const dirty = dirtyScoresRef;
    const dirtyB = dirtyBonusesRef;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const scoresToSave = Array.from(dirty.current.values());
      const bonusesToSave = Array.from(dirtyB.current.values());
      for (const s of scoresToSave) {
        fetch("/api/scoring/hole", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            team_id: team.id,
            hole_number: s.hole_number,
            strokes: s.strokes,
          }),
        });
      }
      for (const b of bonusesToSave) {
        fetch("/api/scoring/bonus", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            team_id: team.id,
            hole_number: b.hole_number,
            user_id: b.user_id,
            on_green: b.on_green,
            holed_out: b.holed_out,
          }),
        });
      }
    };
  }, [team.id]);

  // ── Score Handlers ──

  const handleIncrement = () => {
    if (isLocked) return;
    const holeNum = currentHoleRef.current.hole_number;
    const current = scores[holeNum];
    const newVal = current !== undefined ? Math.min(current + 1, 20) : currentHoleRef.current.par;
    setScores((prev) => ({ ...prev, [holeNum]: newVal }));
    dirtyScoresRef.current.set(holeNum, {
      hole_number: holeNum,
      strokes: newVal,
    });
    scheduleSave();
  };

  const handleDecrement = () => {
    if (isLocked) return;
    const holeNum = currentHoleRef.current.hole_number;
    const current = scores[holeNum];
    if (current !== undefined && current <= 1) return;
    const newVal = current !== undefined ? current - 1 : Math.max(currentHoleRef.current.par - 1, 1);
    setScores((prev) => ({ ...prev, [holeNum]: newVal }));
    dirtyScoresRef.current.set(holeNum, {
      hole_number: holeNum,
      strokes: newVal,
    });
    scheduleSave();
  };

  // Long-press to clear score
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleDecrementStart = () => {
    longPressTimer.current = setTimeout(() => {
      if (isLocked) return;
      const holeNum = currentHoleRef.current.hole_number;
      setScores((prev) => {
        const next = { ...prev };
        delete next[holeNum];
        return next;
      });
      dirtyScoresRef.current.delete(holeNum);
    }, 800);
  };
  const handleDecrementEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };

  // ── Bonus Handlers ──

  const handleOnGreenChange = (userId: string, checked: boolean) => {
    if (isLocked) return;
    const holeNum = currentHoleRef.current.hole_number;
    const key = `${holeNum}-${userId}`;
    const existing = bonuses[key];
    const updated = {
      on_green: checked,
      holed_out: existing?.holed_out || false,
    };
    setBonuses((prev) => ({ ...prev, [key]: updated }));
    dirtyBonusesRef.current.set(key, {
      hole_number: holeNum,
      user_id: userId,
      ...updated,
    });
    scheduleSave();
  };

  const handleHoledOutChange = (userId: string) => {
    if (isLocked) return;
    const holeNum = currentHoleRef.current.hole_number;

    // Check if this user already has holed_out — toggle off
    const currentKey = `${holeNum}-${userId}`;
    const currentBonus = bonuses[currentKey];
    const isCurrentlyHoled = currentBonus?.holed_out || false;

    setBonuses((prev) => {
      const next = { ...prev };
      // Clear holed_out for all members on this hole
      for (const member of members) {
        const mKey = `${holeNum}-${member.user_id}`;
        if (next[mKey]) {
          next[mKey] = { ...next[mKey], holed_out: false };
        }
      }
      // Set the selected one (unless toggling off)
      if (!isCurrentlyHoled) {
        next[currentKey] = {
          on_green: next[currentKey]?.on_green || false,
          holed_out: true,
        };
      }
      return next;
    });

    // Mark dirty: the selected user
    const newHoled = !isCurrentlyHoled;
    const existing = bonuses[currentKey];
    dirtyBonusesRef.current.set(currentKey, {
      hole_number: holeNum,
      user_id: userId,
      on_green: existing?.on_green || false,
      holed_out: newHoled,
    });

    // If setting holed_out, clear others
    if (newHoled) {
      for (const member of members) {
        if (member.user_id === userId) continue;
        const mKey = `${holeNum}-${member.user_id}`;
        const mExisting = bonuses[mKey];
        if (mExisting?.holed_out) {
          dirtyBonusesRef.current.set(mKey, {
            hole_number: holeNum,
            user_id: member.user_id,
            on_green: mExisting.on_green,
            holed_out: false,
          });
        }
      }
    }

    scheduleSave();
  };

  // ── Helpers ──

  const scoreColor = (strokes: number | undefined, par: number): string => {
    if (strokes === undefined) return "text-gray-400";
    if (strokes < par) return "text-green-700 font-bold";
    if (strokes > par) return "text-red-600 font-bold";
    return "text-gray-900";
  };

  // ── onHoleChange callback ──

  const handleHoleChange = useCallback((_holeIndex: number, hole: HoleInfo) => {
    currentHoleRef.current = hole;
  }, []);

  // ── Render ──

  return (
    <>
      <ScoringShell
        holes={holes}
        startingHole={startingHole}
        onClose={() => router.push("/")}
        saveStatus={saveStatus}
        onHoleChange={handleHoleChange}
        headerRight={
          <>
            <PinnedNoteButton pinnedTo="scoring" />
            <button
              onClick={() => { setShowLeaderboard(true); logActivity("leaderboard_view", "/scoring", { contest_id: team.contest_id }); }}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </button>
          </>
        }
        statusBanner={
          <>
            {(contestVerified || isVerified) && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 bg-green-50 text-green-700 text-xs font-medium shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Verified — Scores Official
              </div>
            )}
            {scoringClosed && !contestVerified && !isVerified && (
              <div className="flex items-center justify-center gap-1.5 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium shrink-0">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Scoring Closed — Under Review
              </div>
            )}
          </>
        }
        renderScorecardRows={(holeList) => {
          return (
            <>
              {/* Par row */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-400">
                    {h.par}
                  </td>
                ))}
              </tr>
              {/* Handicap row */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-300">
                    {h.handicap_index}
                  </td>
                ))}
              </tr>
              {/* Score row */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <td
                    key={h.hole_number}
                    className={`px-0 py-0.5 text-center ${scoreColor(
                      scores[h.hole_number],
                      h.par
                    )}`}
                  >
                    {scores[h.hole_number] ?? "\u00b7"}
                  </td>
                ))}
              </tr>
            </>
          );
        }}
        renderScorePanel={(hole) => {
          const currentScore = scores[hole.hole_number];
          return (
            <>
              {/* Score Entry Row */}
              <div className="flex items-center justify-center gap-6 px-4 py-3 bg-white">
                <span className="text-sm font-medium text-gray-500">Team Score:</span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handleDecrement}
                    onTouchStart={handleDecrementStart}
                    onTouchEnd={handleDecrementEnd}
                    onMouseDown={handleDecrementStart}
                    onMouseUp={handleDecrementEnd}
                    onMouseLeave={handleDecrementEnd}
                    disabled={isLocked || (currentScore !== undefined && currentScore <= 1)}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 text-xl font-bold active:bg-gray-200 disabled:opacity-30"
                  >
                    −
                  </button>
                  <span
                    className={`text-3xl font-bold w-12 text-center ${
                      currentScore !== undefined
                        ? scoreColor(currentScore, hole.par)
                        : "text-gray-300"
                    }`}
                  >
                    {currentScore ?? "\u00b7"}
                  </span>
                  <button
                    onClick={handleIncrement}
                    disabled={isLocked}
                    className="w-10 h-10 flex items-center justify-center rounded-full bg-green-600 text-white text-xl font-bold active:bg-green-700 disabled:opacity-30"
                  >
                    +
                  </button>
                </div>
              </div>

              {/* BSPITW Section */}
              <div className="px-4 py-2 bg-amber-50 border-t border-amber-200">
                <div className="flex items-start gap-4">
                  {/* On Green */}
                  <div className="flex-1">
                    <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wide mb-1">
                      On Green
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => {
                        const key = `${hole.hole_number}-${m.user_id}`;
                        const isChecked = bonuses[key]?.on_green || false;
                        return (
                          <button
                            key={m.user_id}
                            onClick={() => handleOnGreenChange(m.user_id, !isChecked)}
                            disabled={isLocked}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                              isChecked
                                ? "bg-green-600 text-white"
                                : "bg-white text-gray-600 border border-gray-200"
                            } ${isLocked ? "opacity-60" : "active:scale-95"}`}
                          >
                            {m.display_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  {/* Holed Out */}
                  <div className="flex-1">
                    <p className="text-[10px] text-amber-600 font-medium uppercase tracking-wide mb-1">
                      Holed Out
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {members.map((m) => {
                        const key = `${hole.hole_number}-${m.user_id}`;
                        const isHoled = bonuses[key]?.holed_out || false;
                        return (
                          <button
                            key={m.user_id}
                            onClick={() => handleHoledOutChange(m.user_id)}
                            disabled={isLocked}
                            className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium transition-colors ${
                              isHoled
                                ? "bg-amber-600 text-white"
                                : "bg-white text-gray-600 border border-gray-200"
                            } ${isLocked ? "opacity-60" : "active:scale-95"}`}
                          >
                            {m.display_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </>
          );
        }}
      />

      {/* Leaderboard Popup */}
      {showLeaderboard && (
        <LeaderboardPopup
          contestId={team.contest_id}
          currentTeamId={team.id}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </>
  );
}
