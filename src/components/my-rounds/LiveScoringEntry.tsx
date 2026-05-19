"use client";

import { useState, useRef, useCallback, useEffect, Fragment } from "react";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import { getScoreDescription } from "@/lib/golf/calculator";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface Player {
  id: string;
  name: string;
  teeName?: string;
  teeId?: string;
  roundPlayerId?: string; // set after round is created
}

interface LiveScoringEntryProps {
  holes: HoleInfo[];
  players: Player[];
  roundType: string;
  courseName: string;
  onClose: () => void;
  // For new rounds: create round on mount
  courseId?: string;
  teeId?: string;
  effectiveTeeId?: string; // current user's tee (may differ for composition tees)
  teeColor?: string | null; // tee color for map markers
  roundDate?: string;
  // For resuming: existing round data
  roundId?: string;
  initialScores?: Record<string, Record<number, number>>;
  initialPutts?: Record<string, Record<number, number>>;
  initialPlayerMap?: Record<string, string>; // userId -> roundPlayerId
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function scoreColorClass(strokes: number | undefined, par: number): string {
  if (strokes === undefined) return "text-gray-300";
  if (strokes < par) return "text-green-700";
  if (strokes > par) return "text-red-600";
  return "text-gray-900";
}

function MiniScoreCell({ score, par }: { score: number | undefined; par: number }) {
  if (score == null) return <span className="text-[10px] text-gray-300">·</span>;
  const diff = score - par;
  if (diff <= -2) {
    return (
      <div className="relative w-[16px] h-[16px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1px] border-green-600" />
        <div className="absolute inset-[2px] rounded-full border-[1px] border-green-600" />
        <span className="relative z-10 text-[9px] font-bold text-green-700">{score}</span>
      </div>
    );
  }
  if (diff === -1) {
    return (
      <div className="relative w-[14px] h-[14px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1px] border-green-600" />
        <span className="relative z-10 text-[9px] font-bold text-green-700">{score}</span>
      </div>
    );
  }
  if (diff === 0) return <span className="text-[10px] font-bold text-gray-900">{score}</span>;
  if (diff === 1) {
    return (
      <div className="relative w-[14px] h-[14px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-sm border-[1px] border-gray-900" />
        <span className="relative z-10 text-[9px] font-bold text-gray-900">{score}</span>
      </div>
    );
  }
  return (
    <div className="relative w-[16px] h-[16px] flex items-center justify-center mx-auto">
      <div className="absolute inset-0 rounded-sm border-[1px] border-gray-900" />
      <div className="absolute inset-[2px] rounded-sm border-[1px] border-gray-900" />
      <span className="relative z-10 text-[9px] font-bold text-gray-900">{score}</span>
    </div>
  );
}

export default function LiveScoringEntry({
  holes: allHoles,
  players: initialPlayers,
  roundType,
  courseName,
  onClose,
  courseId,
  teeId,
  effectiveTeeId,
  teeColor,
  roundDate,
  roundId: existingRoundId,
  initialScores,
  initialPutts,
  initialPlayerMap,
}: LiveScoringEntryProps) {
  // If the effective tee differs (composition tee), fetch resolved holes on mount
  const [resolvedHoles, setResolvedHoles] = useState<HoleInfo[] | null>(null);

  useEffect(() => {
    if (!effectiveTeeId || effectiveTeeId === teeId || !courseId) return;
    // Check if the passed holes already have source_tee_color (already resolved)
    const hasSourceColors = allHoles.some((h) => h.source_tee_color);
    if (hasSourceColors) return;

    async function fetchCompositionHoles() {
      const res = await fetch(`/api/courses/${courseId}/tees/${effectiveTeeId}/holes`);
      if (res.ok) {
        const data = await res.json();
        setResolvedHoles(data.holes || []);
      }
    }
    fetchCompositionHoles();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveTeeId, teeId, courseId]);

  const effectiveHoles = resolvedHoles || allHoles;

  const visibleHoles = effectiveHoles.filter((h) => {
    if (roundType === "9-front") return h.hole_number <= 9;
    if (roundType === "9-back") return h.hole_number > 9;
    return true;
  });

  const [scores, setScores] = useState<Record<string, Record<number, number>>>(initialScores || {});
  const [putts, setPutts] = useState<Record<string, Record<number, number>>>(initialPutts || {});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [roundId, setRoundId] = useState<string | null>(existingRoundId || null);
  const [playerMap, setPlayerMap] = useState<Record<string, string>>(initialPlayerMap || {});
  const [ready, setReady] = useState(!!existingRoundId);
  const [confirmCompleteOpen, setConfirmCompleteOpen] = useState(false);
  const [completing, setCompleting] = useState(false);

  // Dirty tracking
  const dirtyRef = useRef<Map<string, { round_player_id: string; hole_number: number; strokes: number; putts?: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHoleRef = useRef<HoleInfo>(visibleHoles[0]);

  // Create round on mount if new (guard against StrictMode double-mount)
  const creatingRef = useRef(false);
  useEffect(() => {
    if (existingRoundId || !courseId || !teeId || creatingRef.current) return;
    creatingRef.current = true;

    async function createRound() {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          tee_id: teeId,
          round_type: roundType,
          round_date: roundDate || new Date().toISOString().split("T")[0],
          players: initialPlayers.map((p) => ({ user_id: p.id, tee_id: p.teeId || teeId })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setRoundId(data.round.id);
        const map: Record<string, string> = {};
        for (const rp of data.round_players || []) {
          map[rp.user_id] = rp.id;
        }
        setPlayerMap(map);
        setReady(true);
      }
    }
    createRound();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush saves
  const flushSaves = useCallback(async () => {
    const toSave = Array.from(dirtyRef.current.values());
    if (toSave.length === 0 || !roundId) return;

    dirtyRef.current.clear();
    setSaveStatus("saving");

    try {
      // Group by round_player_id for batch upsert
      const playerScoresMap = new Map<string, { hole_number: number; strokes: number; putts?: number }[]>();
      for (const s of toSave) {
        const existing = playerScoresMap.get(s.round_player_id) || [];
        existing.push({ hole_number: s.hole_number, strokes: s.strokes, ...(s.putts !== undefined ? { putts: s.putts } : {}) });
        playerScoresMap.set(s.round_player_id, existing);
      }

      const playerScores = Array.from(playerScoresMap.entries()).map(([rpId, scores]) => ({
        round_player_id: rpId,
        scores,
      }));

      const res = await fetch(`/api/rounds/${roundId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ player_scores: playerScores }),
      });

      if (res.ok) {
        setSaveStatus("saved");
        if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
        savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
      } else {
        setSaveStatus("error");
        for (const s of toSave) {
          dirtyRef.current.set(`${s.round_player_id}-${s.hole_number}`, s);
        }
      }
    } catch {
      setSaveStatus("error");
      for (const s of toSave) {
        dirtyRef.current.set(`${s.round_player_id}-${s.hole_number}`, s);
      }
    }
  }, [roundId]);

  const scheduleSave = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flushSaves, 600);
  }, [flushSaves]);

  // Flush on unmount
  useEffect(() => {
    const dirty = dirtyRef;
    const rid = roundId;
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const toSave = Array.from(dirty.current.values());
      if (toSave.length > 0 && rid) {
        const playerScoresMap = new Map<string, { hole_number: number; strokes: number }[]>();
        for (const s of toSave) {
          const existing = playerScoresMap.get(s.round_player_id) || [];
          existing.push({ hole_number: s.hole_number, strokes: s.strokes });
          playerScoresMap.set(s.round_player_id, existing);
        }
        fetch(`/api/rounds/${rid}/scores`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_scores: Array.from(playerScoresMap.entries()).map(([rpId, scores]) => ({
              round_player_id: rpId,
              scores,
            })),
          }),
        });
      }
    };
  }, [roundId]);

  function setScore(playerId: string, holeNumber: number, value: number) {
    setScores((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [holeNumber]: value },
    }));

    const rpId = playerMap[playerId];
    if (rpId) {
      const key = `${rpId}-${holeNumber}`;
      const existing = dirtyRef.current.get(key);
      dirtyRef.current.set(key, {
        round_player_id: rpId,
        hole_number: holeNumber,
        strokes: value,
        putts: existing?.putts,
      });
      scheduleSave();
    }
  }

  function setPuttCount(playerId: string, holeNumber: number, value: number) {
    setPutts((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || {}), [holeNumber]: value },
    }));

    const rpId = playerMap[playerId];
    if (rpId) {
      const key = `${rpId}-${holeNumber}`;
      const existing = dirtyRef.current.get(key);
      const strokes = scores[playerId]?.[holeNumber];
      if (strokes !== undefined) {
        dirtyRef.current.set(key, {
          round_player_id: rpId,
          hole_number: holeNumber,
          strokes,
          putts: value,
        });
        scheduleSave();
      }
    }
  }

  function increment(playerId: string, par: number, holeNumber: number) {
    const current = scores[playerId]?.[holeNumber];
    if (current === undefined) {
      setScore(playerId, holeNumber, par);
    } else {
      setScore(playerId, holeNumber, Math.min(current + 1, 15));
    }
  }

  function decrement(playerId: string, par: number, holeNumber: number) {
    const current = scores[playerId]?.[holeNumber];
    if (current === undefined) {
      setScore(playerId, holeNumber, Math.max(1, par - 1));
    } else if (current > 1) {
      setScore(playerId, holeNumber, current - 1);
    }
  }

  async function handleComplete() {
    if (completing) return;
    setCompleting(true);
    try {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      await flushSaves();

      if (!roundId) return;

      await fetch(`/api/rounds/${roundId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });

      onClose();
    } finally {
      setCompleting(false);
    }
  }

  const allComplete = initialPlayers.every(
    (p) => visibleHoles.every((h) => scores[p.id]?.[h.hole_number] != null)
  );

  if (!ready) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-500">Setting up round...</p>
        </div>
      </div>
    );
  }

  return (
    <>
    <ScoringShell
      holes={visibleHoles}
      onClose={onClose}
      teeColor={teeColor}
      saveStatus={saveStatus}
      onHoleChange={(_idx, hole) => { currentHoleRef.current = hole; }}
      headerRight={
        <span className="text-xs text-gray-500">
          {initialPlayers.reduce((max, p) => {
            const count = visibleHoles.filter((h) => scores[p.id]?.[h.hole_number] != null).length;
            return Math.max(max, count);
          }, 0)}/{visibleHoles.length}
        </span>
      }
      renderScorecardRows={(holes) => {
        const hasBothNines = holes.length > 9 && holes[0]?.hole_number <= 9;
        const front9 = hasBothNines ? holes.filter((h) => h.hole_number <= 9) : [];
        const back9 = hasBothNines ? holes.filter((h) => h.hole_number > 9) : [];
        return (
          <>
            <tr className="border-t border-gray-100">
              {holes.map((h) => (
                <Fragment key={h.hole_number}>
                  {h.hole_number === 10 && hasBothNines && (
                    <td className="px-0 py-0.5 text-center text-gray-400 font-bold border-l border-r border-gray-200">
                      {front9.reduce((s, fh) => s + fh.par, 0)}
                    </td>
                  )}
                  <td className="px-0 py-0.5 text-center text-gray-400">{h.par}</td>
                </Fragment>
              ))}
              {hasBothNines && (
                <td className="px-0 py-0.5 text-center text-gray-400 font-bold border-l border-r border-gray-200">
                  {back9.reduce((s, h) => s + h.par, 0)}
                </td>
              )}
              <td className="px-0 py-0.5 text-center text-gray-400 font-bold border-l border-gray-200">
                {holes.reduce((s, h) => s + h.par, 0)}
              </td>
            </tr>
            {initialPlayers.map((p) => {
              const total = holes.reduce((s, h) => s + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const front9Total = front9.reduce((s, h) => s + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const back9Total = back9.reduce((s, h) => s + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const hasAny = holes.some((h) => scores[p.id]?.[h.hole_number] != null);
              const hasAnyFront = front9.some((h) => scores[p.id]?.[h.hole_number] != null);
              const hasAnyBack = back9.some((h) => scores[p.id]?.[h.hole_number] != null);
              return (
                <tr key={p.id} className="border-t border-gray-100">
                  {holes.map((h) => (
                    <Fragment key={h.hole_number}>
                      {h.hole_number === 10 && hasBothNines && (
                        <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                          {hasAnyFront ? front9Total : "·"}
                        </td>
                      )}
                      <td className="px-0 py-0.5 text-center">
                        <MiniScoreCell score={scores[p.id]?.[h.hole_number]} par={h.par} />
                      </td>
                    </Fragment>
                  ))}
                  {hasBothNines && (
                    <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-r border-gray-200">
                      {hasAnyBack ? back9Total : "·"}
                    </td>
                  )}
                  <td className="px-0 py-0.5 text-center font-bold text-gray-900 border-l border-gray-200">
                    {hasAny ? total : "·"}
                  </td>
                </tr>
              );
            })}
          </>
        );
      }}
      courseStrip={
        <div className="shrink-0 bg-gray-900 px-4 py-1.5 flex items-center justify-center">
          <span className="text-xs font-medium text-white truncate">{courseName}</span>
        </div>
      }
      renderScorePanel={(hole) => (
        <div className="px-3 pt-2 pb-1">
          <div className="space-y-1.5">
            {initialPlayers.map((p) => {
              const current = scores[p.id]?.[hole.hole_number];
              const hasValue = current !== undefined;
              const description = hasValue ? getScoreDescription(current, hole.par) : null;

              const currentPutts = putts[p.id]?.[hole.hole_number];

              const roundTotal = visibleHoles.reduce((sum, h) => sum + (scores[p.id]?.[h.hole_number] ?? 0), 0);
              const holesPlayed = visibleHoles.filter((h) => scores[p.id]?.[h.hole_number] != null).length;

              return (
                <div key={p.id} className="flex items-center bg-gray-50 rounded-lg px-3 py-1.5">
                  {/* Player info */}
                  <div className="w-14 min-w-0 shrink-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{p.name}</div>
                    {p.teeName && <div className="text-[10px] text-gray-400 truncate">{p.teeName}</div>}
                  </div>
                  {/* Running total */}
                  <div className="w-10 shrink-0 flex items-center justify-center">
                    <span className="text-2xl font-bold tabular-nums text-gray-900">
                      {holesPlayed > 0 ? roundTotal : ""}
                    </span>
                  </div>
                  <div className="flex-1" />
                  {/* Strokes */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => decrement(p.id, hole.par, hole.hole_number)}
                      disabled={hasValue && current <= 1}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold disabled:opacity-30 active:bg-green-700"
                    >
                      −
                    </button>
                    <div className="w-9 flex flex-col items-center leading-none">
                      <span className={`text-2xl font-bold tabular-nums ${scoreColorClass(current, hole.par)}`}>
                        {hasValue ? current : "·"}
                      </span>
                      <span className="text-[7px] text-gray-400 uppercase -mt-0.5">Strokes</span>
                    </div>
                    <button
                      onClick={() => increment(p.id, hole.par, hole.hole_number)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold active:bg-green-700"
                    >
                      +
                    </button>
                  </div>
                  {/* Putts */}
                  <div className="w-px h-7 bg-gray-200 shrink-0 mx-2" />
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => setPuttCount(p.id, hole.hole_number, currentPutts === undefined ? 0 : Math.max(0, currentPutts - 1))}
                      disabled={currentPutts !== undefined && currentPutts <= 0}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold disabled:opacity-30 active:bg-gray-300"
                    >
                      −
                    </button>
                    <div className="w-5 flex flex-col items-center leading-none">
                      <span className="text-base font-bold tabular-nums text-gray-700">
                        {currentPutts ?? "·"}
                      </span>
                      <span className="text-[7px] text-gray-400 uppercase -mt-0.5">Putts</span>
                    </div>
                    <button
                      onClick={() => setPuttCount(p.id, hole.hole_number, currentPutts === undefined ? 1 : Math.min(10, currentPutts + 1))}
                      className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-200 text-gray-600 text-xs font-bold active:bg-gray-300"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Reserved slot: always rendered so the score panel doesn't jump
              when the final score flips allComplete=true. */}
          <button
            type="button"
            onClick={() => setConfirmCompleteOpen(true)}
            disabled={!allComplete}
            aria-hidden={!allComplete}
            tabIndex={allComplete ? 0 : -1}
            className={`w-full mt-2 py-3 font-semibold rounded-xl transition-opacity ${
              allComplete
                ? "bg-green-600 text-white active:bg-green-700 opacity-100"
                : "bg-green-600 text-white opacity-0 pointer-events-none"
            }`}
          >
            Complete Round
          </button>
        </div>
      )}
    />
    <ConfirmModal
      open={confirmCompleteOpen}
      title="Complete round?"
      message="Once you complete this round, it's saved to your history and counted toward your handicap. You can reopen it from the round detail page if you need to fix something."
      confirmLabel={completing ? "Completing..." : "Complete round"}
      cancelLabel="Keep editing"
      onConfirm={async () => {
        setConfirmCompleteOpen(false);
        await handleComplete();
      }}
      onCancel={() => setConfirmCompleteOpen(false)}
    />
    </>
  );
}
