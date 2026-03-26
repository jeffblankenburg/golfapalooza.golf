"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import type { RoundType } from "@/types/golf";

interface RoundData {
  id: string;
  round_date: string;
  round_type: RoundType;
  status: string;
  notes: string | null;
  weather_conditions: string | null;
  completed_at: string | null;
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
    course_rating: number;
    slope_rating: number;
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
    playing_handicap: number | null;
    final_gross_score: number | null;
    final_adjusted_score: number | null;
    final_net_score: number | null;
    score_differential: number | null;
    user: {
      id: string;
      display_name: string;
      full_name: string | null;
    };
    tee: {
      id: string;
      tee_name: string;
      course_rating: number;
      slope_rating: number;
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
      fairway_hit: boolean | null;
      green_in_regulation: boolean | null;
    }[];
  }[];
}

export default function RoundDetailPage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params.roundId as string;

  const [round, setRound] = useState<RoundData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    async function fetchRound() {
      try {
        const response = await fetch(`/api/rounds/${roundId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch round");
        }

        setRound(data.round);
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

  const handleDelete = async () => {
    if (!round) return;

    const confirmed = window.confirm(
      "Are you sure you want to delete this round? This action cannot be undone."
    );

    if (!confirmed) return;

    setIsDeleting(true);

    try {
      const response = await fetch(`/api/rounds/${roundId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to delete round");
      }

      router.push("/rounds");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete round");
      setIsDeleting(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const getRoundTypeLabel = (type: string) => {
    switch (type) {
      case "18":
        return "18 Holes";
      case "9-front":
        return "Front 9";
      case "9-back":
        return "Back 9";
      default:
        return type;
    }
  };

  const getScoreColor = (score: number | null, par: number) => {
    if (score === null || score === 0) return "";
    if (score < par) return "bg-green-100 text-green-700";
    if (score === par) return "bg-gray-100 text-gray-900";
    if (score === par + 1) return "bg-yellow-100 text-yellow-700";
    return "bg-red-100 text-red-700";
  };

  const getScoreToPar = (score: number | null, par: number) => {
    if (score === null) return "";
    const diff = score - par;
    if (diff === 0) return "E";
    if (diff > 0) return `+${diff}`;
    return `${diff}`;
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
        <Link
          href="/rounds"
          className="mt-4 inline-block text-green-600 hover:text-green-800 font-medium"
        >
          Back to Rounds
        </Link>
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

  const totalPar = relevantHoles.reduce((sum, h) => sum + h.par, 0);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-green-600 text-white">
        <div className="px-4 py-4">
          <div className="flex items-center gap-3 mb-4">
            <Link href="/rounds" className="text-white/80 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </Link>
            <div className="flex-1">
              <h1 className="text-xl font-bold">{round.course.name}</h1>
              <p className="text-sm text-white/80">
                {round.course.city}, {round.course.state}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <div className="text-white/60">Date</div>
              <div className="font-medium">{formatDate(round.round_date)}</div>
            </div>
            <div>
              <div className="text-white/60">Round</div>
              <div className="font-medium">{getRoundTypeLabel(round.round_type)}</div>
            </div>
            <div>
              <div className="text-white/60">Tees</div>
              <div className="font-medium">{round.tee.tee_name}</div>
            </div>
            <div>
              <div className="text-white/60">Rating/Slope</div>
              <div className="font-medium">
                {round.tee.course_rating} / {round.tee.slope_rating}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Player Summaries */}
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Results</h2>
        <div className="space-y-3">
          {round.players
            .sort((a, b) => (a.final_gross_score || 999) - (b.final_gross_score || 999))
            .map((player, index) => (
              <div
                key={player.id}
                className="bg-white rounded-lg border border-gray-200 p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <span
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                        index === 0
                          ? "bg-yellow-100 text-yellow-700"
                          : "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div>
                      <div className="font-medium text-gray-900">
                        {player.user.display_name}
                      </div>
                      <div className="text-xs text-gray-500">
                        {player.tee.tee_name} - HCP: {player.playing_handicap || 0}
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-2xl font-bold text-gray-900">
                      {player.final_gross_score || "-"}
                    </div>
                    <div className="text-sm text-gray-500">
                      {player.final_gross_score
                        ? getScoreToPar(player.final_gross_score, totalPar)
                        : ""}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 pt-3 border-t border-gray-100 text-center">
                  <div>
                    <div className="text-xs text-gray-500">Adjusted</div>
                    <div className="font-semibold text-gray-900">
                      {player.final_adjusted_score || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Net</div>
                    <div className="font-semibold text-gray-900">
                      {player.final_net_score || "-"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500">Differential</div>
                    <div className="font-semibold text-gray-900">
                      {player.score_differential?.toFixed(1) || "-"}
                    </div>
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* Scorecard */}
      <div className="p-4">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Scorecard</h2>
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-green-600 text-white">
                  <th className="sticky left-0 z-10 bg-green-600 px-3 py-2 text-left font-medium w-20">
                    Hole
                  </th>
                  {relevantHoles.map((hole) => (
                    <th key={hole.hole_number} className="px-2 py-2 text-center font-bold min-w-[40px]">
                      {hole.hole_number}
                    </th>
                  ))}
                  <th className="px-2 py-2 text-center font-bold bg-green-700 min-w-[40px]">
                    TOT
                  </th>
                </tr>
                <tr className="bg-gray-100 border-b">
                  <td className="sticky left-0 z-10 bg-gray-100 px-3 py-1 font-medium text-gray-700">
                    Par
                  </td>
                  {relevantHoles.map((hole) => (
                    <td key={hole.hole_number} className="px-2 py-1 text-center text-gray-600">
                      {hole.par}
                    </td>
                  ))}
                  <td className="px-2 py-1 text-center font-medium text-gray-700 bg-gray-200">
                    {totalPar}
                  </td>
                </tr>
              </thead>
              <tbody>
                {round.players.map((player, playerIndex) => {
                  const playerTotal = player.scores.reduce(
                    (sum, s) => sum + (s.strokes || 0),
                    0
                  );

                  return (
                    <tr
                      key={player.id}
                      className={`border-b ${playerIndex % 2 === 0 ? "bg-white" : "bg-gray-50"}`}
                    >
                      <td
                        className={`sticky left-0 z-10 px-3 py-2 font-medium text-gray-900 ${
                          playerIndex % 2 === 0 ? "bg-white" : "bg-gray-50"
                        }`}
                      >
                        <span className="truncate block max-w-[80px]">
                          {player.user.display_name}
                        </span>
                      </td>
                      {relevantHoles.map((hole) => {
                        const score = player.scores.find(
                          (s) => s.hole_number === hole.hole_number
                        );
                        return (
                          <td
                            key={hole.hole_number}
                            className={`px-2 py-2 text-center font-medium ${getScoreColor(
                              score?.strokes ?? null,
                              hole.par
                            )}`}
                          >
                            {score?.strokes || "-"}
                          </td>
                        );
                      })}
                      <td className="px-2 py-2 text-center font-bold bg-gray-200">
                        {playerTotal || "-"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Notes */}
      {round.notes && (
        <div className="p-4">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Notes</h2>
          <div className="bg-white rounded-lg border border-gray-200 p-4 text-gray-700">
            {round.notes}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="p-4">
        <button
          type="button"
          onClick={handleDelete}
          disabled={isDeleting}
          className="w-full py-3 border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 rounded-lg font-medium"
        >
          {isDeleting ? "Deleting..." : "Delete Round"}
        </button>
      </div>
    </div>
  );
}
