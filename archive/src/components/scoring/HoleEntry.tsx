"use client";

import { useState, useRef, useEffect } from "react";
import { ScoreInput } from "./ScoreInput";

interface Player {
  id: string;
  display_name: string;
  score: number | null;
  is_scorer: boolean;
  tee_name?: string;
}

interface Hole {
  number: number;
  par: number;
  handicap_index: number;
  yards: number;
}

interface HoleEntryProps {
  holes: Hole[];
  players: Player[];
  currentHole: number;
  onHoleChange: (holeNumber: number) => void;
  onScoreChange: (playerId: string, holeNumber: number, strokes: number) => void;
  disabled?: boolean;
}

export function HoleEntry({
  holes,
  players,
  currentHole,
  onHoleChange,
  onScoreChange,
  disabled = false,
}: HoleEntryProps) {
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchEnd, setTouchEnd] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentHoleData = holes.find((h) => h.number === currentHole);
  const minSwipeDistance = 50;

  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null);
    setTouchStart(e.targetTouches[0].clientX);
  };

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX);
  };

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return;

    const distance = touchStart - touchEnd;
    const isLeftSwipe = distance > minSwipeDistance;
    const isRightSwipe = distance < -minSwipeDistance;

    if (isLeftSwipe && currentHole < holes.length) {
      onHoleChange(currentHole + 1);
    }
    if (isRightSwipe && currentHole > 1) {
      onHoleChange(currentHole - 1);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && currentHole > 1) {
        onHoleChange(currentHole - 1);
      } else if (e.key === "ArrowRight" && currentHole < holes.length) {
        onHoleChange(currentHole + 1);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [currentHole, holes.length, onHoleChange]);

  if (!currentHoleData) return null;

  return (
    <div
      ref={containerRef}
      className="flex flex-col h-full"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
    >
      {/* Hole Header */}
      <div className="bg-green-600 text-white p-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => onHoleChange(currentHole - 1)}
            disabled={currentHole <= 1}
            className="p-2 rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="text-center">
            <div className="text-3xl font-bold">Hole {currentHole}</div>
            <div className="flex items-center justify-center gap-4 text-sm opacity-90">
              <span>Par {currentHoleData.par}</span>
              <span>{currentHoleData.yards} yds</span>
              <span>HCP {currentHoleData.handicap_index}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onHoleChange(currentHole + 1)}
            disabled={currentHole >= holes.length}
            className="p-2 rounded-full hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {/* Hole Progress */}
        <div className="flex justify-center gap-1 mt-3">
          {holes.map((hole) => (
            <button
              key={hole.number}
              type="button"
              onClick={() => onHoleChange(hole.number)}
              className={`w-2 h-2 rounded-full transition-colors ${
                hole.number === currentHole
                  ? "bg-white"
                  : "bg-green-400 hover:bg-green-300"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Player Scores */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="space-y-6">
          {players.map((player, index) => (
            <div
              key={player.id}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-4"
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 bg-green-100 text-green-700 rounded-full flex items-center justify-center font-bold">
                    {index + 1}
                  </span>
                  <div className="flex flex-col">
                    <span className="font-medium text-gray-900">
                      {player.display_name}
                    </span>
                    {player.tee_name && (
                      <span className="text-xs text-gray-500">
                        {player.tee_name}
                      </span>
                    )}
                  </div>
                </div>
                {player.is_scorer && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                    Scorer
                  </span>
                )}
              </div>

              <ScoreInput
                value={player.score}
                par={currentHoleData.par}
                onChange={(strokes) => onScoreChange(player.id, currentHole, strokes)}
                disabled={disabled || !player.is_scorer}
                size="lg"
              />
            </div>
          ))}
        </div>
      </div>

      {/* Swipe hint */}
      <div className="text-center text-xs text-gray-400 pb-2">
        Swipe left/right to change holes
      </div>
    </div>
  );
}
