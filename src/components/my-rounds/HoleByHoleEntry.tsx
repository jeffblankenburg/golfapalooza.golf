"use client";

import { useState, useRef, useCallback } from "react";
import ScoreInput from "./ScoreInput";
import { getScoreColorClass, getScoreDescription } from "@/lib/golf/calculator";

interface HoleData {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}

interface HoleByHoleEntryProps {
  holes: HoleData[];
  scores: Record<number, number>;
  onScoreChange: (holeNumber: number, strokes: number | null) => void;
  onComplete: () => void;
  roundType: string;
}

export default function HoleByHoleEntry({
  holes,
  scores,
  onScoreChange,
  onComplete,
  roundType,
}: HoleByHoleEntryProps) {
  const [currentHole, setCurrentHole] = useState(0);
  const touchStartX = useRef(0);

  const visibleHoles = holes.filter((h) => {
    if (roundType === "9-front") return h.hole_number <= 9;
    if (roundType === "9-back") return h.hole_number > 9;
    return true;
  });

  const totalPar = visibleHoles.reduce((sum, h) => sum + h.par, 0);
  const totalStrokes = visibleHoles.reduce((sum, h) => sum + (scores[h.hole_number] || 0), 0);
  const holesScored = visibleHoles.filter((h) => scores[h.hole_number] != null).length;
  const allScored = holesScored === visibleHoles.length;
  const scoreToPar = totalStrokes - totalPar;

  const goNext = useCallback(() => {
    if (currentHole < visibleHoles.length - 1) setCurrentHole(currentHole + 1);
  }, [currentHole, visibleHoles.length]);

  const goPrev = useCallback(() => {
    if (currentHole > 0) setCurrentHole(currentHole - 1);
  }, [currentHole]);

  const hole = visibleHoles[currentHole];
  if (!hole) return null;

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 1) {
      touchStartX.current = e.touches[0].clientX;
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(diff) > 50) {
      if (diff < 0) goNext();
      else goPrev();
    }
  }

  return (
    <div
      className="flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Progress bar */}
      <div className="flex gap-1 mb-4">
        {visibleHoles.map((h, i) => {
          const scored = scores[h.hole_number] != null;
          return (
            <button
              key={h.hole_number}
              onClick={() => setCurrentHole(i)}
              className={`flex-1 h-2 rounded-full transition-colors ${
                i === currentHole
                  ? "bg-green-600"
                  : scored
                  ? "bg-green-300"
                  : "bg-gray-200"
              }`}
            />
          );
        })}
      </div>

      {/* Hole header */}
      <div className="text-center mb-6">
        <div className="text-sm text-gray-500 mb-1">Hole {hole.hole_number}</div>
        <div className="flex items-center justify-center gap-6">
          <div>
            <div className="text-xs text-gray-400">Par</div>
            <div className="text-2xl font-bold text-gray-900">{hole.par}</div>
          </div>
          {hole.yards && (
            <div>
              <div className="text-xs text-gray-400">Yards</div>
              <div className="text-lg font-medium text-gray-700">{hole.yards}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-gray-400">Hdcp</div>
            <div className="text-lg font-medium text-gray-700">{hole.handicap_index}</div>
          </div>
        </div>
      </div>

      {/* Score input */}
      <div className="flex flex-col items-center mb-6">
        <ScoreInput
          value={scores[hole.hole_number] ?? null}
          par={hole.par}
          onChange={(val) => onScoreChange(hole.hole_number, val)}
        />
        {scores[hole.hole_number] != null && (
          <div className={`text-sm mt-2 font-medium ${getScoreColorClass(scores[hole.hole_number], hole.par)?.replace("bg-", "text-").split(" ")[0] || "text-gray-600"}`}>
            {getScoreDescription(scores[hole.hole_number], hole.par)}
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={goPrev}
          disabled={currentHole === 0}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
        >
          ← Prev
        </button>
        <span className="text-sm text-gray-500">
          {currentHole + 1} / {visibleHoles.length}
        </span>
        <button
          onClick={goNext}
          disabled={currentHole === visibleHoles.length - 1}
          className="px-4 py-2 text-sm font-medium text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-30 transition-colors"
        >
          Next →
        </button>
      </div>

      {/* Running total */}
      <div className="bg-gray-50 rounded-lg p-3 mb-4">
        <div className="flex justify-between text-sm">
          <span className="text-gray-600">
            {holesScored} of {visibleHoles.length} holes scored
          </span>
          <span className="font-medium">
            {totalStrokes > 0 && (
              <>
                {totalStrokes}{" "}
                <span className={scoreToPar > 0 ? "text-red-600" : scoreToPar < 0 ? "text-green-600" : "text-gray-600"}>
                  ({scoreToPar > 0 ? "+" : ""}{scoreToPar})
                </span>
              </>
            )}
          </span>
        </div>
      </div>

      {/* Complete button */}
      {allScored && (
        <button
          onClick={onComplete}
          className="w-full py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors"
        >
          Complete Round — {totalStrokes} ({scoreToPar > 0 ? "+" : ""}{scoreToPar})
        </button>
      )}
    </div>
  );
}
