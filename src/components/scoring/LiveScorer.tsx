"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { logActivity } from "@/components/ActivityTracker";

type ImageView = "overhead" | "green";
type SaveStatus = "idle" | "saving" | "saved" | "error";

interface HoleInfo {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number;
  tee_color: string | null;
  overhead_image_url: string | null;
  green_image_url: string | null;
}

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

function getDistance(t1: React.Touch, t2: React.Touch) {
  return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
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
                      : "·"}
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

  // Determine initial hole index based on starting hole
  const initialIndex = Math.max(
    0,
    holes.findIndex((h) => h.hole_number === startingHole)
  );
  const [currentHoleIndex, setCurrentHoleIndex] = useState(initialIndex);

  const [imageView, setImageView] = useState<ImageView>("overhead");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showLeaderboard, setShowLeaderboard] = useState(false);

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

  // Swipe state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const SWIPE_THRESHOLD = 50;

  // Pinch-to-zoom state
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSnapBack, setIsSnapBack] = useState(false);
  const gestureRef = useRef({
    isPinching: false,
    isPanning: false,
    initialDist: 0,
    initialScale: 1,
    initialOffset: { x: 0, y: 0 },
    initialMid: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
  });

  // Mini scorecard scroll ref
  const scorecardRef = useRef<HTMLDivElement>(null);

  const hole = holes[currentHoleIndex];

  // Reset zoom on hole change
  useEffect(() => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  }, [currentHoleIndex]);

  // Auto-scroll mini scorecard to keep current hole visible
  useEffect(() => {
    if (scorecardRef.current) {
      const container = scorecardRef.current;
      const activeCell = container.querySelector('[data-active="true"]');
      if (activeCell) {
        const cellEl = activeCell as HTMLElement;
        const containerRect = container.getBoundingClientRect();
        const cellRect = cellEl.getBoundingClientRect();
        if (
          cellRect.left < containerRect.left ||
          cellRect.right > containerRect.right
        ) {
          cellEl.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
            inline: "center",
          });
        }
      }
    }
  }, [currentHoleIndex]);

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
    const holeNum = hole.hole_number;
    const current = scores[holeNum];
    const newVal = current !== undefined ? Math.min(current + 1, 20) : hole.par;
    setScores((prev) => ({ ...prev, [holeNum]: newVal }));
    dirtyScoresRef.current.set(holeNum, {
      hole_number: holeNum,
      strokes: newVal,
    });
    scheduleSave();
  };

  const handleDecrement = () => {
    if (isLocked) return;
    const holeNum = hole.hole_number;
    const current = scores[holeNum];
    if (current !== undefined && current <= 1) return;
    const newVal = current !== undefined ? current - 1 : Math.max(hole.par - 1, 1);
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
      const holeNum = hole.hole_number;
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
    const holeNum = hole.hole_number;
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
    const holeNum = hole.hole_number;

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

  // ── Navigation ──

  const goToHole = useCallback(
    (index: number) => {
      if (index >= 0 && index < holes.length) {
        setIsAnimating(true);
        setCurrentHoleIndex(index);
        setDragOffset(0);
        setTimeout(() => setIsAnimating(false), 300);
      }
    },
    [holes.length]
  );

  // ── Touch Handlers (combined swipe + pinch-to-zoom) ──

  const handleTouchStart = (e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (e.touches.length === 2) {
      // Start pinch
      g.isPinching = true;
      g.isPanning = false;
      g.initialDist = getDistance(e.touches[0], e.touches[1]);
      g.initialScale = scale;
      g.initialOffset = { x: offset.x, y: offset.y };
      g.initialMid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      setIsSnapBack(false);
      isHorizontalSwipe.current = null;
    } else if (e.touches.length === 1 && scale > 1) {
      // Start pan (when zoomed)
      g.isPanning = true;
      g.panStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      g.panStartOffset = { x: offset.x, y: offset.y };
    } else if (e.touches.length === 1 && scale === 1) {
      // Start swipe (existing behavior)
      touchStartX.current = e.touches[0].clientX;
      touchStartY.current = e.touches[0].clientY;
      isHorizontalSwipe.current = null;
      setIsAnimating(false);
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const g = gestureRef.current;

    if (g.isPinching && e.touches.length >= 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.min(
        4,
        Math.max(1, g.initialScale * (dist / g.initialDist))
      );
      const mid = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2,
      };
      setScale(newScale);
      setOffset({
        x: g.initialOffset.x + (mid.x - g.initialMid.x),
        y: g.initialOffset.y + (mid.y - g.initialMid.y),
      });
      return;
    }

    if (g.isPanning && e.touches.length === 1) {
      e.preventDefault();
      setOffset({
        x: g.panStartOffset.x + (e.touches[0].clientX - g.panStart.x),
        y: g.panStartOffset.y + (e.touches[0].clientY - g.panStart.y),
      });
      return;
    }

    // Swipe logic (only when scale === 1)
    if (scale === 1) {
      const deltaX = e.touches[0].clientX - touchStartX.current;
      const deltaY = e.touches[0].clientY - touchStartY.current;

      if (isHorizontalSwipe.current === null) {
        if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
          isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
        }
      }

      if (isHorizontalSwipe.current) {
        e.preventDefault();
        setDragOffset(deltaX);
      }
    }
  };

  const handleTouchEnd = () => {
    const g = gestureRef.current;

    if (g.isPinching) {
      g.isPinching = false;
      if (scale < 1.1) {
        setIsSnapBack(true);
        setScale(1);
        setOffset({ x: 0, y: 0 });
        setTimeout(() => setIsSnapBack(false), 200);
      }
      return;
    }

    if (g.isPanning) {
      g.isPanning = false;
      return;
    }

    // Swipe logic (only when scale === 1)
    if (scale === 1) {
      if (Math.abs(dragOffset) > SWIPE_THRESHOLD) {
        if (dragOffset < 0 && currentHoleIndex < holes.length - 1) {
          goToHole(currentHoleIndex + 1);
        } else if (dragOffset > 0 && currentHoleIndex > 0) {
          goToHole(currentHoleIndex - 1);
        } else {
          setDragOffset(0);
        }
      } else {
        setDragOffset(0);
      }
      isHorizontalSwipe.current = null;
    }
  };

  // ── Derived Values ──

  const currentImageUrl =
    imageView === "overhead"
      ? hole?.overhead_image_url
      : hole?.green_image_url;

  const hasOverhead = !!hole?.overhead_image_url;
  const hasGreen = !!hole?.green_image_url;
  const hasAnyImage = hasOverhead || hasGreen;

  const currentScore = hole ? scores[hole.hole_number] : undefined;

  // Mini scorecard computations
  const front9 = holes.filter((h) => h.hole_number <= 9);
  const back9 = holes.filter((h) => h.hole_number > 9);
  const front9Par = front9.reduce((s, h) => s + h.par, 0);
  const back9Par = back9.reduce((s, h) => s + h.par, 0);
  const front9Total = front9.reduce(
    (s, h) => s + (scores[h.hole_number] || 0),
    0
  );
  const back9Total = back9.reduce(
    (s, h) => s + (scores[h.hole_number] || 0),
    0
  );
  const hasFront = front9.some((h) => scores[h.hole_number] !== undefined);
  const hasBack = back9.some((h) => scores[h.hole_number] !== undefined);
  const totalScore = hasFront || hasBack ? front9Total + back9Total : null;
  const totalPar = front9Par + back9Par;

  const scoreColor = (strokes: number | undefined, par: number): string => {
    if (strokes === undefined) return "text-gray-400";
    if (strokes < par) return "text-green-700 font-bold";
    if (strokes > par) return "text-red-600 font-bold";
    return "text-gray-900";
  };

  if (!hole) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={() => router.push("/")}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <h1 className="text-lg font-bold text-gray-900">
          Hole {hole.hole_number}
        </h1>

        <div className="flex items-center gap-2">
          {/* View Toggle */}
          {hasAnyImage && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setImageView("overhead")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  imageView === "overhead"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Overhead
              </button>
              <button
                onClick={() => setImageView("green")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  imageView === "green"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Green
              </button>
            </div>
          )}
          {/* Leaderboard */}
          <button
            onClick={() => { setShowLeaderboard(true); logActivity("leaderboard_view", "/scoring", { contest_id: contestId }); }}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </button>
        </div>
      </div>

      {/* Hole stats */}
      <div className="flex items-center justify-center gap-4 px-4 py-1.5 text-sm text-gray-500 bg-gray-50 shrink-0">
        <span>
          Par <span className="font-bold text-gray-900">{hole.par}</span>
        </span>
        <span className="w-px h-4 bg-gray-200" />
        <span>
          <span className="font-bold text-gray-900">{hole.yards}</span> yds
        </span>
        <span className="w-px h-4 bg-gray-200" />
        <span>
          Hdcp <span className="font-bold text-gray-900">{hole.handicap_index}</span>
        </span>
      </div>

      {/* Mini Scorecard (moved up) */}
      <div
        ref={scorecardRef}
        className="overflow-x-auto border-t border-gray-200 bg-white shrink-0"
      >
        <table className="w-full text-[10px]" style={{ tableLayout: "fixed", minWidth: "600px" }}>
          <colgroup>
            {front9.map((h) => (
              <col key={h.hole_number} />
            ))}
            <col style={{ width: "32px" }} />
            {back9.map((h) => (
              <col key={h.hole_number} />
            ))}
            <col style={{ width: "32px" }} />
            <col style={{ width: "36px" }} />
          </colgroup>
          {/* Hole numbers */}
          <thead>
            <tr className="bg-gray-50">
              {front9.map((h) => (
                <th
                  key={h.hole_number}
                  data-active={h.hole_number === hole.hole_number}
                  onClick={() =>
                    goToHole(holes.findIndex((x) => x.hole_number === h.hole_number))
                  }
                  className={`px-0 py-1 text-center font-bold cursor-pointer ${
                    h.hole_number === hole.hole_number
                      ? "bg-green-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  {h.hole_number}
                </th>
              ))}
              <th className="px-0 py-1 text-center text-gray-500 font-bold bg-gray-100">
                OUT
              </th>
              {back9.map((h) => (
                <th
                  key={h.hole_number}
                  data-active={h.hole_number === hole.hole_number}
                  onClick={() =>
                    goToHole(holes.findIndex((x) => x.hole_number === h.hole_number))
                  }
                  className={`px-0 py-1 text-center font-bold cursor-pointer ${
                    h.hole_number === hole.hole_number
                      ? "bg-green-600 text-white"
                      : "text-gray-500"
                  }`}
                >
                  {h.hole_number}
                </th>
              ))}
              <th className="px-0 py-1 text-center text-gray-500 font-bold bg-gray-100">
                IN
              </th>
              <th className="px-0 py-1 text-center text-gray-500 font-bold bg-gray-200">
                TOT
              </th>
            </tr>
          </thead>
          <tbody>
            {/* Handicap row */}
            <tr className="border-t border-gray-100">
              {front9.map((h) => (
                <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-300">
                  {h.handicap_index}
                </td>
              ))}
              <td className="px-0 py-0.5 text-center text-gray-300 bg-gray-50">
                Hdcp
              </td>
              {back9.map((h) => (
                <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-300">
                  {h.handicap_index}
                </td>
              ))}
              <td className="px-0 py-0.5 text-center text-gray-300 bg-gray-50" />
              <td className="px-0 py-0.5 text-center text-gray-300 bg-gray-100" />
            </tr>
            {/* Par row */}
            <tr className="border-t border-gray-100">
              {front9.map((h) => (
                <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-400">
                  {h.par}
                </td>
              ))}
              <td className="px-0 py-0.5 text-center text-gray-500 font-semibold bg-gray-50">
                {front9Par}
              </td>
              {back9.map((h) => (
                <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-400">
                  {h.par}
                </td>
              ))}
              <td className="px-0 py-0.5 text-center text-gray-500 font-semibold bg-gray-50">
                {back9Par}
              </td>
              <td className="px-0 py-0.5 text-center text-gray-500 font-bold bg-gray-100">
                {totalPar}
              </td>
            </tr>
            {/* Score row */}
            <tr className="border-t border-gray-100">
              {front9.map((h) => (
                <td
                  key={h.hole_number}
                  className={`px-0 py-0.5 text-center ${scoreColor(
                    scores[h.hole_number],
                    h.par
                  )}`}
                >
                  {scores[h.hole_number] ?? "·"}
                </td>
              ))}
              <td className="px-0 py-0.5 text-center text-gray-900 font-semibold bg-gray-50">
                {hasFront ? front9Total : "·"}
              </td>
              {back9.map((h) => (
                <td
                  key={h.hole_number}
                  className={`px-0 py-0.5 text-center ${scoreColor(
                    scores[h.hole_number],
                    h.par
                  )}`}
                >
                  {scores[h.hole_number] ?? "·"}
                </td>
              ))}
              <td className="px-0 py-0.5 text-center text-gray-900 font-semibold bg-gray-50">
                {hasBack ? back9Total : "·"}
              </td>
              <td className="px-0 py-0.5 text-center text-gray-900 font-bold bg-gray-100">
                {totalScore ?? "·"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Scoring status banner */}
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
      {!isLocked && Object.keys(scores).length > 0 && (
        <div className="flex items-center justify-center gap-1.5 py-1 bg-amber-50 text-amber-700 text-xs font-medium shrink-0">
          Unofficial
        </div>
      )}

      {/* Swipeable Image Area with Pinch-to-Zoom */}
      <div
        className="flex-1 min-h-0 overflow-hidden bg-white relative touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Save status overlay */}
        {saveStatus !== "idle" && (
          <div
            className={`absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium shadow-md transition-opacity duration-300 ${
              saveStatus === "saving"
                ? "bg-blue-50 text-blue-600"
                : saveStatus === "saved"
                ? "bg-green-50 text-green-600"
                : "bg-red-50 text-red-600"
            }`}
          >
            {saveStatus === "saving" && (
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            )}
            {saveStatus === "saving" && "Saving..."}
            {saveStatus === "saved" && "Saved"}
            {saveStatus === "error" && "Save failed — will retry"}
          </div>
        )}

        {/* Prev/Next arrows */}
        {currentHoleIndex > 0 && (
          <button
            onClick={() => goToHole(currentHoleIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-[5] w-10 h-10 flex items-center justify-center rounded-full bg-black/20 text-white active:bg-black/40"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {currentHoleIndex < holes.length - 1 && (
          <button
            onClick={() => goToHole(currentHoleIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-[5] w-10 h-10 flex items-center justify-center rounded-full bg-black/20 text-white active:bg-black/40"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <div
          className="w-full h-full relative"
          style={{
            transform: scale === 1
              ? `translateX(${dragOffset}px)`
              : `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transition: isSnapBack
              ? "transform 0.2s ease-out"
              : isAnimating
              ? "transform 0.3s ease-out"
              : "none",
          }}
        >
          {currentImageUrl ? (
            <Image
              key={`${hole.hole_number}-${imageView}`}
              src={currentImageUrl}
              alt={`Hole ${hole.hole_number} ${imageView} view`}
              fill
              className="object-contain animate-fade-in"
              priority
              sizes="(max-width: 768px) 100vw, 512px"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <svg
                className="w-16 h-16 mb-2"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-sm">No {imageView} image</p>
            </div>
          )}
        </div>
      </div>

      {/* Score Entry Row */}
      <div className="flex items-center justify-center gap-6 px-4 py-3 bg-white border-t border-gray-100 shrink-0">
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
            {currentScore ?? "·"}
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
      <div className="px-4 py-2 pb-7 bg-amber-50 border-t border-amber-200 shrink-0" style={{ paddingBottom: `max(1.75rem, calc(0.5rem + env(safe-area-inset-bottom)))` }}>
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

      {/* Leaderboard Popup */}
      {showLeaderboard && (
        <LeaderboardPopup
          contestId={team.contest_id}
          currentTeamId={team.id}
          onClose={() => setShowLeaderboard(false)}
        />
      )}
    </div>
  );
}
