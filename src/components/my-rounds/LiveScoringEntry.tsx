"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import { getScoreDescription } from "@/lib/golf/calculator";

interface Player {
  id: string;
  name: string;
  teeName?: string;
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
  roundDate?: string;
  // For resuming: existing round data
  roundId?: string;
  initialScores?: Record<string, Record<number, number>>;
  initialPlayerMap?: Record<string, string>; // userId -> roundPlayerId
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function scoreColorClass(strokes: number | undefined, par: number): string {
  if (strokes === undefined) return "text-gray-300";
  if (strokes < par) return "text-green-700";
  if (strokes > par) return "text-red-600";
  return "text-gray-900";
}

export default function LiveScoringEntry({
  holes: allHoles,
  players: initialPlayers,
  roundType,
  courseName,
  onClose,
  courseId,
  teeId,
  roundDate,
  roundId: existingRoundId,
  initialScores,
  initialPlayerMap,
}: LiveScoringEntryProps) {
  const visibleHoles = allHoles.filter((h) => {
    if (roundType === "9-front") return h.hole_number <= 9;
    if (roundType === "9-back") return h.hole_number > 9;
    return true;
  });

  const [scores, setScores] = useState<Record<string, Record<number, number>>>(initialScores || {});
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [roundId, setRoundId] = useState<string | null>(existingRoundId || null);
  const [playerMap, setPlayerMap] = useState<Record<string, string>>(initialPlayerMap || {});
  const [ready, setReady] = useState(!!existingRoundId);

  // Dirty tracking
  const dirtyRef = useRef<Map<string, { round_player_id: string; hole_number: number; strokes: number }>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const currentHoleRef = useRef<HoleInfo>(visibleHoles[0]);

  // Create round on mount if new
  useEffect(() => {
    if (existingRoundId || !courseId || !teeId) return;

    async function createRound() {
      const res = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: courseId,
          tee_id: teeId,
          round_type: roundType,
          round_date: roundDate || new Date().toISOString().split("T")[0],
          players: initialPlayers.map((p) => ({ user_id: p.id, tee_id: teeId })),
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
      const playerScoresMap = new Map<string, { hole_number: number; strokes: number }[]>();
      for (const s of toSave) {
        const existing = playerScoresMap.get(s.round_player_id) || [];
        existing.push({ hole_number: s.hole_number, strokes: s.strokes });
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
      dirtyRef.current.set(`${rpId}-${holeNumber}`, {
        round_player_id: rpId,
        hole_number: holeNumber,
        strokes: value,
      });
      scheduleSave();
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

  function decrement(playerId: string, holeNumber: number) {
    const current = scores[playerId]?.[holeNumber];
    if (current !== undefined && current > 1) {
      setScore(playerId, holeNumber, current - 1);
    }
  }

  async function handleComplete() {
    // Flush any pending saves first
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    await flushSaves();

    if (!roundId) return;

    // Complete the round
    await fetch(`/api/rounds/${roundId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "completed" }),
    });

    onClose();
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
    <ScoringShell
      holes={visibleHoles}
      onClose={onClose}
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
      renderScorecardRows={(holes) => (
        <>
          <tr className="border-t border-gray-100">
            {holes.map((h) => (
              <td key={h.hole_number} className="px-0 py-0.5 text-center text-gray-400">{h.par}</td>
            ))}
          </tr>
          {initialPlayers.map((p) => (
            <tr key={p.id} className="border-t border-gray-100">
              {holes.map((h) => {
                const s = scores[p.id]?.[h.hole_number];
                return (
                  <td key={h.hole_number} className={`px-0 py-0.5 text-center font-bold ${scoreColorClass(s, h.par)}`}>
                    {s ?? "·"}
                  </td>
                );
              })}
            </tr>
          ))}
        </>
      )}
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

              return (
                <div key={p.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-gray-700 truncate">{p.name}</div>
                    <div className="flex items-center gap-1.5">
                      {p.teeName && <span className="text-[10px] text-gray-400">{p.teeName}</span>}
                      {description && (
                        <span className={`text-[10px] font-medium ${scoreColorClass(current, hole.par)}`}>
                          {p.teeName ? "·" : ""} {description}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => decrement(p.id, hole.hole_number)}
                      disabled={!hasValue || current <= 1}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold disabled:opacity-30 active:bg-green-700"
                    >
                      −
                    </button>
                    <span className={`text-2xl font-bold w-9 text-center tabular-nums ${scoreColorClass(current, hole.par)}`}>
                      {hasValue ? current : "·"}
                    </span>
                    <button
                      onClick={() => increment(p.id, hole.par, hole.hole_number)}
                      className="w-9 h-9 flex items-center justify-center rounded-full bg-green-600 text-white text-lg font-bold active:bg-green-700"
                    >
                      +
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {allComplete && (
            <button
              onClick={handleComplete}
              className="w-full mt-2 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
            >
              Complete Round
            </button>
          )}
        </div>
      )}
    />
  );
}
