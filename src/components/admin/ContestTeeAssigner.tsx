"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { getTeeColorClasses } from "@/lib/tee-colors";

// ── Types ──

interface Tee {
  id: string;
  tee_name: string;
  tee_color: string | null;
  course_rating: number;
  slope_rating: number;
  par: number;
  total_yards: number | null;
}

interface HoleData {
  id: string;
  tee_id: string;
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

interface ContestInfo {
  id: string;
  trip_id: string;
  name: string;
  contest_type: string;
}

// ── Component ──

export function ContestTeeAssigner({ contestId }: { contestId: string }) {
  const [contest, setContest] = useState<ContestInfo | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [assignments, setAssignments] = useState<Map<number, string>>(new Map());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contestRef = useRef<ContestInfo | null>(null);
  const assignmentsRef = useRef<Map<number, string>>(new Map());

  // Keep refs in sync
  useEffect(() => { contestRef.current = contest; }, [contest]);
  useEffect(() => { assignmentsRef.current = assignments; }, [assignments]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/contest-tees?contest_id=${contestId}`);
      const data = await res.json();

      setContest(data.contest || null);
      setTees(data.tees || []);
      setHoles(data.holes || []);
      setErrorMessage(data.error_message || null);

      const map = new Map<number, string>();
      if (data.assignments) {
        for (const a of data.assignments) {
          map.set(a.hole_number, a.tee_id);
        }
      }
      setAssignments(map);
    } catch {
      setErrorMessage("Failed to load tee data");
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Flush pending save on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      // Fire-and-forget save of latest state
      const c = contestRef.current;
      const a = assignmentsRef.current;
      if (c && a.size > 0) {
        const isRC = c.contest_type === "ryder_cup";
        const body: Record<string, unknown> = { contest_id: c.id };
        if (isRC) {
          const allSame = a.size === 18 && new Set(a.values()).size === 1;
          body.tee_id = allSame ? a.get(1) : a.get(1);
        } else {
          body.assignments = Array.from(a.entries()).map(
            ([hole_number, tee_id]) => ({ hole_number, tee_id })
          );
        }
        fetch("/api/admin/contest-tees", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
    };
  }, []);

  const isRyderCup = contest?.contest_type === "ryder_cup";

  // Get the single tee_id if all 18 holes share the same tee
  const singleTeeId =
    assignments.size === 18 &&
    new Set(assignments.values()).size === 1
      ? assignments.get(1) || null
      : null;

  // Auto-save with debounce
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaveState("saving");

    saveTimerRef.current = setTimeout(async () => {
      const c = contestRef.current;
      const a = assignmentsRef.current;
      if (!c || a.size === 0) {
        setSaveState("idle");
        return;
      }

      const body: Record<string, unknown> = { contest_id: c.id };
      const isRC = c.contest_type === "ryder_cup";

      if (isRC) {
        const allSame = a.size === 18 && new Set(a.values()).size === 1;
        body.tee_id = allSame ? a.get(1) : a.get(1);
      } else {
        body.assignments = Array.from(a.entries()).map(
          ([hole_number, tee_id]) => ({ hole_number, tee_id })
        );
      }

      try {
        const res = await fetch("/api/admin/contest-tees", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        if (res.ok) {
          setSaveState("saved");
          savedTimerRef.current = setTimeout(() => setSaveState("idle"), 1500);
        } else {
          setSaveState("error");
        }
      } catch {
        setSaveState("error");
      }
    }, 500);
  }, []);

  function setAllHolesToTee(teeId: string) {
    const map = new Map<number, string>();
    for (let h = 1; h <= 18; h++) map.set(h, teeId);
    setAssignments(map);
    scheduleSave();
  }

  function setHoleTee(hole: number, teeId: string) {
    setAssignments((prev) => {
      const next = new Map(prev);
      next.set(hole, teeId);
      return next;
    });
    scheduleSave();
  }

  // Compute mixed par summary
  function computeSummary() {
    if (assignments.size === 0) return null;

    const teeCounts = new Map<string, number>();
    let totalPar = 0;

    for (const [holeNum, teeId] of assignments) {
      teeCounts.set(teeId, (teeCounts.get(teeId) || 0) + 1);
      const hole = holes.find(
        (h) => h.tee_id === teeId && h.hole_number === holeNum
      );
      if (hole) totalPar += hole.par;
    }

    const parts: { tee: Tee; count: number }[] = [];
    for (const [teeId, count] of teeCounts) {
      const tee = tees.find((t) => t.id === teeId);
      if (tee) parts.push({ tee, count });
    }

    return { parts, totalPar };
  }

  // ── Render ──

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <div className="w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin" />
        Loading tee assignments...
      </div>
    );
  }

  if (errorMessage) {
    return <p className="text-sm text-gray-500">{errorMessage}</p>;
  }

  if (tees.length === 0) return null;

  const summary = computeSummary();

  return (
    <div className="space-y-4">
      {/* Auto-save status */}
      {saveState !== "idle" && (
        <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg ${
          saveState === "saving" ? "bg-blue-50 text-blue-600" :
          saveState === "saved" ? "bg-green-50 text-green-600" :
          "bg-red-50 text-red-600"
        }`}>
          {saveState === "saving" && (
            <>
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          )}
          {saveState === "saved" && (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved
            </>
          )}
          {saveState === "error" && (
            <>
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              Save failed
            </>
          )}
        </div>
      )}

      {/* Quick-fill row (shown for both modes — for Ryder Cup it IS the picker) */}
        <div>
          {!isRyderCup && (
            <p className="text-xs text-gray-500 mb-2">Set all holes to:</p>
          )}
          <div className="flex flex-wrap gap-2">
            {tees.map((tee) => {
              const colors = getTeeColorClasses(tee.tee_color);
              const isSelected = isRyderCup
                ? singleTeeId === tee.id
                : false;

              return (
                <button
                  key={tee.id}
                  onClick={() => setAllHolesToTee(tee.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                    colors.isCustom ? "" : colors.bg
                  } ${colors.text} ${
                    isSelected
                      ? `ring-2 ${colors.ring} ring-offset-2`
                      : "opacity-80 hover:opacity-100"
                  }`}
                  style={
                    colors.isCustom
                      ? { backgroundColor: colors.hex || undefined }
                      : undefined
                  }
                >
                  {tee.tee_name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Ryder Cup summary */}
        {isRyderCup && summary && summary.parts.length === 1 && (
          <p className="text-sm text-gray-600">
            All 18 holes from {summary.parts[0].tee.tee_name} Tees (Par{" "}
            {summary.totalPar})
          </p>
        )}

        {/* Scramble per-hole list */}
        {!isRyderCup && (
          <div className="space-y-1">
            {Array.from({ length: 18 }, (_, i) => i + 1).map((holeNum) => {
              const selectedTeeId = assignments.get(holeNum);
              // Get hole data from the selected tee, or fallback to first tee
              const selectedHole = selectedTeeId
                ? holes.find(
                    (h) =>
                      h.tee_id === selectedTeeId && h.hole_number === holeNum
                  )
                : null;

              return (
                <div
                  key={holeNum}
                  className="flex items-center gap-3 py-1.5"
                >
                  <span className="text-xs font-mono text-gray-400 w-5 text-right">
                    {holeNum}
                  </span>
                  <div className="flex gap-1.5 flex-1">
                    {tees.map((tee) => {
                      const colors = getTeeColorClasses(tee.tee_color);
                      const isSelected = selectedTeeId === tee.id;

                      return (
                        <button
                          key={tee.id}
                          onClick={() => setHoleTee(holeNum, tee.id)}
                          className={`w-7 h-7 rounded-lg text-[10px] font-bold flex items-center justify-center transition-all ${
                            colors.isCustom ? "" : colors.bg
                          } ${colors.text} ${
                            isSelected
                              ? `ring-2 ${colors.ring} ring-offset-1 scale-110`
                              : "opacity-40 hover:opacity-70"
                          }`}
                          style={
                            colors.isCustom
                              ? {
                                  backgroundColor: colors.hex || undefined,
                                }
                              : undefined
                          }
                          title={tee.tee_name}
                        >
                          {tee.tee_name[0]}
                        </button>
                      );
                    })}
                  </div>
                  {selectedHole && (
                    <span className="text-xs text-gray-500 tabular-nums w-20 text-right">
                      Par {selectedHole.par}
                      {selectedHole.yards ? ` · ${selectedHole.yards}y` : ""}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Scramble summary */}
        {!isRyderCup && summary && summary.parts.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              {summary.parts
                .map((p) => `${p.tee.tee_name}: ${p.count}`)
                .join(" | ")}{" "}
              — Mixed Par: {summary.totalPar}
            </p>
          </div>
        )}
    </div>
  );
}
