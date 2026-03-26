"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { HoleEntry } from "@/components/scoring/HoleEntry";
import { Scorecard } from "@/components/scoring/Scorecard";
import type { RoundType } from "@/types/golf";

interface RoundData {
  id: string;
  round_date: string;
  round_type: RoundType;
  status: string;
  course: {
    id: string;
    name: string;
    city: string;
    state: string;
  };
  tee: {
    id: string;
    tee_name: string;
    par: number;
    holes: {
      id: string;
      hole_number: number;
      par: number;
      handicap_index: number;
      yards: number;
    }[];
  };
  players: {
    id: string;
    user_id: string;
    player_position: number;
    is_scorer: boolean;
    user: {
      id: string;
      display_name: string;
      full_name: string | null;
    };
    tee: {
      id: string;
      tee_name: string;
      holes: {
        id: string;
        hole_number: number;
        par: number;
        handicap_index: number;
        yards: number;
      }[];
    };
    scores: {
      id: string;
      hole_number: number;
      strokes: number | null;
      putts: number | null;
    }[];
  }[];
}

type ViewMode = "hole" | "scorecard";

export default function ActiveRoundPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params.roundId as string;

  const [round, setRound] = useState<RoundData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("hole");
  const [currentHole, setCurrentHole] = useState(1);
  const [isSaving, setIsSaving] = useState(false);
  const [isCompleting, setIsCompleting] = useState(false);

  // Track pending score changes for debounced saving
  const [pendingChanges, setPendingChanges] = useState<
    Map<string, { playerId: string; holeNumber: number; strokes: number }>
  >(new Map());

  // Fetch round data
  useEffect(() => {
    async function fetchRound() {
      try {
        const response = await fetch(`/api/rounds/${roundId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch round");
        }

        setRound(data.round);

        // Set initial hole based on round type
        if (data.round.round_type === "9-back") {
          setCurrentHole(10);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load round");
      } finally {
        setIsLoading(false);
      }
    }

    if (roundId) {
      fetchRound();
    }
  }, [roundId]);

  // Save pending changes with debounce
  useEffect(() => {
    if (pendingChanges.size === 0) return;

    const timeout = setTimeout(async () => {
      const changes = Array.from(pendingChanges.values());
      setPendingChanges(new Map());
      setIsSaving(true);

      try {
        const scores = changes.map((c) => ({
          round_player_id: c.playerId,
          hole_number: c.holeNumber,
          strokes: c.strokes,
        }));

        await fetch(`/api/rounds/${roundId}/scores`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scores }),
        });
      } catch (err) {
        console.error("Failed to save scores:", err);
      } finally {
        setIsSaving(false);
      }
    }, 500);

    return () => clearTimeout(timeout);
  }, [pendingChanges, roundId]);

  const handleScoreChange = useCallback(
    (playerId: string, holeNumber: number, strokes: number) => {
      // Optimistically update local state
      setRound((prev) => {
        if (!prev) return prev;

        return {
          ...prev,
          players: prev.players.map((player) => {
            if (player.id !== playerId) return player;

            return {
              ...player,
              scores: player.scores.map((score) => {
                if (score.hole_number !== holeNumber) return score;
                return { ...score, strokes };
              }),
            };
          }),
        };
      });

      // Queue for saving
      setPendingChanges((prev) => {
        const next = new Map(prev);
        next.set(`${playerId}-${holeNumber}`, { playerId, holeNumber, strokes });
        return next;
      });
    },
    []
  );

  const handleCompleteRound = async () => {
    if (!round) return;

    const confirmed = window.confirm(
      "Are you sure you want to complete this round? This will calculate final scores and differentials."
    );

    if (!confirmed) return;

    setIsCompleting(true);

    try {
      const response = await fetch(`/api/rounds/${roundId}/complete`, {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to complete round");
      }

      router.push(`/rounds/${roundId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to complete round");
      setIsCompleting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin h-10 w-10 border-4 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error || !round) {
    return (
      <div className="p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error || "Round not found"}
        </div>
        <button
          type="button"
          onClick={() => router.push("/scoring")}
          className="mt-4 text-green-600 hover:text-green-800 font-medium"
        >
          Back to Scoring
        </button>
      </div>
    );
  }

  // Get holes based on round type
  const allHoles = round.tee.holes.sort((a, b) => a.hole_number - b.hole_number);
  const relevantHoles =
    round.round_type === "9-front"
      ? allHoles.filter((h) => h.hole_number <= 9)
      : round.round_type === "9-back"
      ? allHoles.filter((h) => h.hole_number > 9)
      : allHoles;

  // Transform players for components
  const playersForHoleEntry = round.players.map((p) => ({
    id: p.id,
    display_name: p.user.display_name,
    score: p.scores.find((s) => s.hole_number === currentHole)?.strokes ?? null,
    is_scorer: p.is_scorer,
    tee_name: p.tee?.tee_name,
  }));

  const playersForScorecard = round.players.map((p) => ({
    id: p.id,
    display_name: p.user.display_name,
    is_scorer: p.is_scorer,
    tee_name: p.tee?.tee_name,
    scores: p.scores.reduce(
      (acc, s) => {
        acc[s.hole_number] = s.strokes;
        return acc;
      },
      {} as Record<number, number | null>
    ),
  }));

  const holesForComponents = relevantHoles.map((h) => ({
    number: h.hole_number,
    par: h.par,
    handicap_index: h.handicap_index,
    yards: h.yards,
  }));

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-20">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.push("/scoring")}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="font-semibold text-gray-900 truncate max-w-[200px]">
                {round.course.name}
              </h1>
              <p className="text-xs text-gray-500">
                {round.tee.tee_name} -{" "}
                {round.round_type === "18"
                  ? "18 Holes"
                  : round.round_type === "9-front"
                  ? "Front 9"
                  : "Back 9"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {isSaving && (
              <span className="text-xs text-gray-500 flex items-center gap-1">
                <div className="animate-spin h-3 w-3 border-2 border-green-500 border-t-transparent rounded-full" />
                Saving...
              </span>
            )}

            {/* View Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                type="button"
                onClick={() => setViewMode("hole")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === "hole"
                    ? "bg-white text-green-700 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Hole
              </button>
              <button
                type="button"
                onClick={() => setViewMode("scorecard")}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  viewMode === "scorecard"
                    ? "bg-white text-green-700 shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Card
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {viewMode === "hole" ? (
          <HoleEntry
            holes={holesForComponents}
            players={playersForHoleEntry}
            currentHole={currentHole}
            onHoleChange={setCurrentHole}
            onScoreChange={handleScoreChange}
          />
        ) : (
          <div className="p-4 overflow-x-auto">
            <Scorecard
              holes={holesForComponents}
              players={playersForScorecard}
              onScoreChange={handleScoreChange}
              roundType={round.round_type}
            />
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div className="bg-white border-t border-gray-200 p-4">
        <button
          type="button"
          onClick={handleCompleteRound}
          disabled={isCompleting}
          className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium rounded-lg flex items-center justify-center gap-2"
        >
          {isCompleting ? (
            <>
              <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
              Completing Round...
            </>
          ) : (
            <>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Complete Round
            </>
          )}
        </button>
      </div>
    </div>
  );
}
