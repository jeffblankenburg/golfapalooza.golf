"use client";

import { useState, useEffect, useCallback } from "react";

// ── Tee color helpers (mirrors CourseManager.tsx) ──

const TEE_COLOR_OPTIONS = [
  { value: "black", label: "Black", bg: "bg-gray-900", text: "text-white", ring: "ring-gray-900" },
  { value: "blue", label: "Blue", bg: "bg-blue-600", text: "text-white", ring: "ring-blue-600" },
  { value: "white", label: "White", bg: "bg-white border border-gray-300", text: "text-gray-900", ring: "ring-gray-400" },
  { value: "gold", label: "Gold", bg: "bg-yellow-400", text: "text-gray-900", ring: "ring-yellow-400" },
  { value: "red", label: "Red", bg: "bg-red-600", text: "text-white", ring: "ring-red-600" },
  { value: "green", label: "Green", bg: "bg-green-700", text: "text-white", ring: "ring-green-700" },
  { value: "silver", label: "Silver", bg: "bg-gray-400", text: "text-white", ring: "ring-gray-400" },
];

function isHexColor(color: string | null): boolean {
  return !!color && /^#[0-9a-fA-F]{6}$/.test(color);
}

function getContrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "text-gray-900" : "text-white";
}

function getTeeColorClasses(color: string | null) {
  const match = TEE_COLOR_OPTIONS.find((c) => c.value === color);
  if (match) return { ...match, isCustom: false, hex: null };
  if (isHexColor(color))
    return { bg: "", text: getContrastText(color!), ring: "", isCustom: true, hex: color };
  return { bg: "bg-gray-100", text: "text-gray-600", ring: "ring-gray-300", isCustom: false, hex: null };
}

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

interface Assignment {
  id?: string;
  hole_number: number;
  tee_id: string;
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
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [dirty, setDirty] = useState(false);

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
      setDirty(false);
    } catch {
      setErrorMessage("Failed to load tee data");
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const isKgbCup = contest?.contest_type === "kgb_cup";

  // Get the single tee_id if all 18 holes share the same tee
  const singleTeeId =
    assignments.size === 18 &&
    new Set(assignments.values()).size === 1
      ? assignments.get(1) || null
      : null;

  function setAllHolesToTee(teeId: string) {
    const map = new Map<number, string>();
    for (let h = 1; h <= 18; h++) map.set(h, teeId);
    setAssignments(map);
    setDirty(true);
  }

  function setHoleTee(hole: number, teeId: string) {
    setAssignments((prev) => {
      const next = new Map(prev);
      next.set(hole, teeId);
      return next;
    });
    setDirty(true);
  }

  async function save() {
    if (!contest) return;
    setSaveState("saving");

    const body: Record<string, unknown> = { contest_id: contest.id };

    if (isKgbCup && singleTeeId) {
      body.tee_id = singleTeeId;
    } else if (isKgbCup) {
      // KGB Cup but no tee selected
      const firstTee = assignments.get(1);
      if (firstTee) {
        body.tee_id = firstTee;
      } else {
        setSaveState("idle");
        return;
      }
    } else {
      body.assignments = Array.from(assignments.entries()).map(
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
        setDirty(false);
        setTimeout(() => setSaveState("idle"), 2000);
      } else {
        setSaveState("idle");
      }
    } catch {
      setSaveState("idle");
    }
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
      {/* Quick-fill row (shown for both modes — for KGB Cup it IS the picker) */}
        <div>
          {!isKgbCup && (
            <p className="text-xs text-gray-500 mb-2">Set all holes to:</p>
          )}
          <div className="flex flex-wrap gap-2">
            {tees.map((tee) => {
              const colors = getTeeColorClasses(tee.tee_color);
              const isSelected = isKgbCup
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

        {/* KGB Cup summary */}
        {isKgbCup && summary && summary.parts.length === 1 && (
          <p className="text-sm text-gray-600">
            All 18 holes from {summary.parts[0].tee.tee_name} Tees (Par{" "}
            {summary.totalPar})
          </p>
        )}

        {/* Scramble per-hole list */}
        {!isKgbCup && (
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
        {!isKgbCup && summary && summary.parts.length > 0 && (
          <div className="pt-2 border-t border-gray-100">
            <p className="text-sm text-gray-600">
              {summary.parts
                .map((p) => `${p.tee.tee_name}: ${p.count}`)
                .join(" | ")}{" "}
              — Mixed Par: {summary.totalPar}
            </p>
          </div>
        )}

        {/* Save button */}
        {assignments.size > 0 && (
          <button
            onClick={save}
            disabled={saveState === "saving" || !dirty}
            className={`w-full py-2.5 rounded-xl text-sm font-semibold transition-colors ${
              saveState === "saved"
                ? "bg-green-100 text-green-700"
                : dirty
                ? "bg-green-600 text-white hover:bg-green-700 active:bg-green-800"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saveState === "saving"
              ? "Saving..."
              : saveState === "saved"
              ? "Saved!"
              : "Save Tee Assignments"}
          </button>
        )}
    </div>
  );
}
