"use client";

import { useState, useRef, useCallback, useEffect, Fragment } from "react";
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
  scores: Record<number, number>;
}

interface LeaderboardHole {
  hole_number: number;
  par: number;
}

interface BspitwEntry {
  user_id: string;
  display_name: string;
  under_par_points: number;
  on_green_points: number;
  holed_out_points: number;
  total_points: number;
}

function ScorecardCell({ score, par }: { score: number | undefined; par: number }) {
  if (score == null) return <span className="text-[10px] text-gray-300">·</span>;
  const diff = score - par;
  // Eagle or better: double circle
  if (diff <= -2) {
    return (
      <div className="relative w-[22px] h-[22px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <div className="absolute inset-[3px] rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] font-bold text-green-700">{score}</span>
      </div>
    );
  }
  // Birdie: single circle
  if (diff === -1) {
    return (
      <div className="relative w-[18px] h-[18px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] font-bold text-green-700">{score}</span>
      </div>
    );
  }
  // Par: plain
  if (diff === 0) {
    return <span className="text-[10px] font-bold text-gray-900">{score}</span>;
  }
  // Bogey: single square
  if (diff === 1) {
    return (
      <div className="relative w-[18px] h-[18px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
        <span className="relative z-10 text-[10px] font-bold text-gray-900">{score}</span>
      </div>
    );
  }
  // Double bogey or worse: double square
  return (
    <div className="relative w-[22px] h-[22px] flex items-center justify-center mx-auto">
      <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
      <div className="absolute inset-[3px] rounded-sm border-[1.5px] border-gray-900" />
      <span className="relative z-10 text-[10px] font-bold text-gray-900">{score}</span>
    </div>
  );
}

function MiniScorecard({
  holes,
  scores,
}: {
  holes: LeaderboardHole[];
  scores: Record<number, number>;
}) {
  // Split into chunks of 9 so 18-hole rounds get OUT/IN/TOT subtotals
  const chunks: LeaderboardHole[][] = [];
  for (let i = 0; i < holes.length; i += 9) {
    chunks.push(holes.slice(i, i + 9));
  }
  const overallStrokes = holes.reduce((sum, h) => sum + (scores[h.hole_number] ?? 0), 0);
  const overallPlayed = holes.filter((h) => scores[h.hole_number] != null);
  const overallPar = overallPlayed.reduce((sum, h) => sum + h.par, 0);

  return (
    <div className="mt-2 px-3 pb-3 overflow-x-auto">
      <div className="space-y-3 min-w-max">
        {chunks.map((chunk, i) => {
          const subStrokes = chunk.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const subPlayedPar = chunk
            .filter((h) => scores[h.hole_number] != null)
            .reduce((s, h) => s + h.par, 0);
          const totalLabel = chunks.length > 1 ? (i === 0 ? "OUT" : "IN") : "TOT";
          return (
            <div key={i}>
              <div className="grid gap-1" style={{ gridTemplateColumns: `36px repeat(${chunk.length}, 26px) 36px` }}>
                <div className="text-[10px] font-semibold text-gray-400 uppercase">Hole</div>
                {chunk.map((h) => (
                  <div key={h.hole_number} className="text-[10px] text-center text-gray-500 tabular-nums">
                    {h.hole_number}
                  </div>
                ))}
                <div className="text-[10px] text-center font-semibold text-gray-400 uppercase">{totalLabel}</div>

                <div className="text-[10px] font-semibold text-gray-400 uppercase">Par</div>
                {chunk.map((h) => (
                  <div key={h.hole_number} className="text-[11px] text-center text-gray-400 tabular-nums">
                    {h.par}
                  </div>
                ))}
                <div className="text-[11px] text-center text-gray-400 tabular-nums">
                  {chunk.reduce((s, h) => s + h.par, 0)}
                </div>

                <div className="text-[10px] font-semibold text-gray-500 uppercase">Score</div>
                {chunk.map((h) => (
                  <div key={h.hole_number} className="text-center flex items-center justify-center min-h-[22px]">
                    <ScorecardCell score={scores[h.hole_number]} par={h.par} />
                  </div>
                ))}
                <div className="text-sm text-center font-semibold text-gray-700 tabular-nums">
                  {subStrokes > 0 ? subStrokes : "·"}
                  {subStrokes > 0 && subPlayedPar > 0 && (
                    <span className={`block text-[9px] font-normal ${
                      subStrokes - subPlayedPar < 0
                        ? "text-green-600"
                        : subStrokes - subPlayedPar > 0
                        ? "text-red-600"
                        : "text-gray-400"
                    }`}>
                      {subStrokes - subPlayedPar === 0
                        ? "E"
                        : subStrokes - subPlayedPar > 0
                        ? `+${subStrokes - subPlayedPar}`
                        : `${subStrokes - subPlayedPar}`}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
        {chunks.length > 1 && overallStrokes > 0 && (
          <div className="flex items-baseline justify-end gap-2 text-xs pr-1">
            <span className="text-gray-400 uppercase">Total</span>
            <span className="font-bold text-gray-800 tabular-nums">{overallStrokes}</span>
            <span className={`tabular-nums ${
              overallStrokes - overallPar < 0
                ? "text-green-600"
                : overallStrokes - overallPar > 0
                ? "text-red-600"
                : "text-gray-400"
            }`}>
              ({overallStrokes - overallPar === 0
                ? "E"
                : overallStrokes - overallPar > 0
                ? `+${overallStrokes - overallPar}`
                : `${overallStrokes - overallPar}`})
            </span>
          </div>
        )}
      </div>
    </div>
  );
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
  const [tab, setTab] = useState<"scramble" | "bspitw">("scramble");
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [holes, setHoles] = useState<LeaderboardHole[]>([]);
  const [dayName, setDayName] = useState<string | null>(null);
  const [tripId, setTripId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [bspitw, setBspitw] = useState<BspitwEntry[] | null>(null);
  const [bspitwLoading, setBspitwLoading] = useState(false);

  const toggleExpanded = (teamId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  };

  const fetchLeaderboard = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/scoring/leaderboard?contest_id=${contestId}`
      );
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data.leaderboard || []);
        if (data.holes) setHoles(data.holes);
        if (data.day_name) setDayName(data.day_name);
        if (data.trip_id) setTripId(data.trip_id);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  const fetchBspitw = useCallback(async () => {
    if (!tripId) return;
    setBspitwLoading(true);
    try {
      const res = await fetch(`/api/bspitw?trip_id=${tripId}`);
      if (res.ok) {
        const data = await res.json();
        setBspitw(data.leaderboard || []);
      }
    } catch {
      // silently fail
    } finally {
      setBspitwLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    if (tab === "bspitw" && tripId && bspitw == null) {
      fetchBspitw();
    }
  }, [tab, tripId, bspitw, fetchBspitw]);

  // Refresh BSPITW alongside the scramble leaderboard when it's already been loaded
  useEffect(() => {
    if (tab === "bspitw" && tripId && bspitw != null) {
      const interval = setInterval(fetchBspitw, 30000);
      return () => clearInterval(interval);
    }
  }, [tab, tripId, bspitw, fetchBspitw]);

  useEffect(() => {
    fetchLeaderboard();
    const interval = setInterval(fetchLeaderboard, 30000);
    return () => clearInterval(interval);
  }, [fetchLeaderboard]);

  const scrambleTabLabel = dayName ?? "Scramble";

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-6 animate-slide-up max-h-[70vh] overflow-y-auto">
        <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />

        {/* Tab switcher */}
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-4">
          <button
            type="button"
            onClick={() => setTab("scramble")}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === "scramble"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            {scrambleTabLabel}
          </button>
          <button
            type="button"
            onClick={() => setTab("bspitw")}
            className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors ${
              tab === "bspitw"
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500"
            }`}
          >
            BSPITW
          </button>
        </div>

        {tab === "scramble" && (
          loading ? (
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
              const isOpen = expanded.has(entry.team_id);
              return (
                <div
                  key={entry.team_id}
                  className={`rounded-xl ${
                    isMe ? "bg-green-50 border border-green-200" : "bg-gray-50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => toggleExpanded(entry.team_id)}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-left"
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
                    <svg
                      className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {isOpen && holes.length > 0 && (
                    <MiniScorecard holes={holes} scores={entry.scores || {}} />
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {tab === "bspitw" && (
          bspitwLoading || bspitw == null ? (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : bspitw.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">No standings yet</p>
          ) : (
            <div className="space-y-1">
              {bspitw.map((entry, i) => (
                <div
                  key={entry.user_id}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-gray-50"
                >
                  <span className="text-sm font-bold text-gray-400 w-6 text-center">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">
                      {entry.display_name}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Score {entry.under_par_points} · Bonus {entry.on_green_points + entry.holed_out_points}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-gray-900 tabular-nums">
                    {entry.total_points}
                  </span>
                </div>
              ))}
            </div>
          )
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
          const hasBothNines = holeList.length > 9 && holeList[0]?.hole_number <= 9;
          const front9 = hasBothNines ? holeList.filter((h) => h.hole_number <= 9) : [];
          const back9 = hasBothNines ? holeList.filter((h) => h.hole_number > 9) : [];

          const front9Par = front9.reduce((s, h) => s + h.par, 0);
          const back9Par = back9.reduce((s, h) => s + h.par, 0);
          const totalPar = holeList.reduce((s, h) => s + h.par, 0);

          const front9Score = front9.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const back9Score = back9.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const totalScore = holeList.reduce((s, h) => s + (scores[h.hole_number] ?? 0), 0);
          const hasAnyFront = front9.some((h) => scores[h.hole_number] != null);
          const hasAnyBack = back9.some((h) => scores[h.hole_number] != null);
          const hasAny = holeList.some((h) => scores[h.hole_number] != null);

          return (
            <>
              {/* Par row */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-r border-gray-200">
                        {front9Par}
                      </td>
                    )}
                    <td className="px-0 py-0.5 text-center text-gray-400">{h.par}</td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-r border-gray-200">
                    {back9Par}
                  </td>
                )}
                <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-gray-200">
                  {totalPar}
                </td>
              </tr>
              {/* Handicap row */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
                    )}
                    <td className="px-0 py-0.5 text-center text-gray-300">{h.handicap_index}</td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
                )}
                <td className="px-0 py-0.5 text-center text-gray-300 border-l border-gray-200" />
              </tr>
              {/* Score row */}
              <tr className="border-t border-gray-100">
                {holeList.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && (
                      <td className="px-0 py-1 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                        {hasAnyFront ? front9Score : "\u00b7"}
                      </td>
                    )}
                    <td className="px-0 py-1 text-center">
                      <div className="flex items-center justify-center min-h-[22px]">
                        <ScorecardCell score={scores[h.hole_number]} par={h.par} />
                      </div>
                    </td>
                  </Fragment>
                ))}
                {hasBothNines && (
                  <td className="px-0 py-1 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                    {hasAnyBack ? back9Score : "\u00b7"}
                  </td>
                )}
                <td className="px-0 py-1 text-center font-bold text-gray-900 border-l border-gray-200">
                  {hasAny ? totalScore : "\u00b7"}
                </td>
              </tr>
            </>
          );
        }}
        renderScorePanel={(hole) => {
          const currentScore = scores[hole.hole_number];
          return (
            <>
              {/* Score Entry Row */}
              <div className="flex items-center justify-between gap-4 px-4 py-3 bg-white">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-sm font-medium text-gray-500 shrink-0">Team Score:</span>
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
                {(() => {
                  let strokes = 0;
                  let played = 0;
                  let parPlayed = 0;
                  for (const h of holes) {
                    const s = scores[h.hole_number];
                    if (s != null) {
                      strokes += s;
                      parPlayed += h.par;
                      played++;
                    }
                  }
                  if (played === 0) {
                    return (
                      <div className="text-right shrink-0">
                        <div className="text-[10px] uppercase tracking-wide text-gray-400">Round</div>
                        <div className="text-2xl font-bold text-gray-300 tabular-nums">·</div>
                      </div>
                    );
                  }
                  const rel = strokes - parPlayed;
                  return (
                    <div className="text-right shrink-0">
                      <div className="text-[10px] uppercase tracking-wide text-gray-400">Round</div>
                      <div
                        className={`text-2xl font-bold tabular-nums ${
                          rel < 0
                            ? "text-green-700"
                            : rel > 0
                            ? "text-red-600"
                            : "text-gray-900"
                        }`}
                      >
                        {formatRelPar(rel)}
                      </div>
                    </div>
                  );
                })()}
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
