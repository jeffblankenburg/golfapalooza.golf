"use client";

import { useState, useEffect } from "react";

interface HandicapData {
  handicap_index: number;
  low_handicap_index: number;
  rounds_used: number;
  last_calculated_at: string;
  effective_date: string;
}

interface RecentRound {
  score_differential: number;
  final_adjusted_score: number;
  round: {
    id: string;
    round_date: string;
    course: {
      name: string;
    };
    tee: {
      course_rating: number;
      slope_rating: number;
    };
  };
}

export default function HandicapPage() {
  const [handicap, setHandicap] = useState<HandicapData | null>(null);
  const [recentRounds, setRecentRounds] = useState<RecentRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHandicap = async () => {
    try {
      const response = await fetch("/api/handicap");
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to fetch handicap");
      }

      setHandicap(data.handicap);
      setRecentRounds(data.recent_rounds || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load handicap");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchHandicap();
  }, []);

  const handleRecalculate = async () => {
    setIsRecalculating(true);
    setError(null);

    try {
      const response = await fetch("/api/handicap", {
        method: "POST",
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.message || "Failed to recalculate handicap");
      }

      if (data.success && data.handicap) {
        setHandicap({
          handicap_index: data.handicap.handicap_index,
          low_handicap_index: data.handicap.low_handicap_index,
          rounds_used: data.handicap.rounds_used,
          last_calculated_at: new Date().toISOString(),
          effective_date: new Date().toISOString().split("T")[0],
        });
      } else {
        setError(data.message || "Unable to calculate handicap");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to recalculate handicap");
    } finally {
      setIsRecalculating(false);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  };

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 pb-24">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">My Handicap</h1>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          {error}
        </div>
      )}

      {/* Handicap Card */}
      <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-2xl p-6 text-white mb-6">
        <div className="text-center mb-6">
          <div className="text-sm opacity-80 mb-1">Handicap Index</div>
          <div className="text-6xl font-bold">
            {handicap?.handicap_index !== undefined
              ? handicap.handicap_index.toFixed(1)
              : "-.-"}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
          <div className="text-center">
            <div className="text-sm opacity-80">Low Index</div>
            <div className="text-xl font-semibold">
              {handicap?.low_handicap_index !== undefined
                ? handicap.low_handicap_index.toFixed(1)
                : "-.-"}
            </div>
          </div>
          <div className="text-center">
            <div className="text-sm opacity-80">Rounds Used</div>
            <div className="text-xl font-semibold">
              {handicap?.rounds_used ?? 0}
            </div>
          </div>
        </div>

        {handicap?.last_calculated_at && (
          <div className="mt-4 pt-4 border-t border-white/20 text-center text-sm opacity-80">
            Last updated: {formatDate(handicap.last_calculated_at)}
          </div>
        )}
      </div>

      {/* Recalculate Button */}
      <button
        type="button"
        onClick={handleRecalculate}
        disabled={isRecalculating}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 text-white font-medium rounded-lg flex items-center justify-center gap-2 mb-6"
      >
        {isRecalculating ? (
          <>
            <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
            Recalculating...
          </>
        ) : (
          <>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Recalculate Handicap
          </>
        )}
      </button>

      {/* How It Works */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6">
        <h3 className="font-semibold text-gray-900 mb-2">How It Works</h3>
        <p className="text-sm text-gray-600 mb-2">
          Your Handicap Index is calculated using the USGA World Handicap System:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 list-disc list-inside">
          <li>Best 8 of your last 20 score differentials</li>
          <li>Score Differential = (113 / Slope) x (Adjusted Score - Rating)</li>
          <li>Minimum 3 rounds required for initial handicap</li>
        </ul>
      </div>

      {/* Recent Rounds */}
      {recentRounds.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            Recent Differentials
          </h2>
          <div className="space-y-2">
            {recentRounds.map((roundData, index) => (
              <div
                key={index}
                className="bg-white border border-gray-200 rounded-lg p-3 flex items-center justify-between"
              >
                <div>
                  <div className="font-medium text-gray-900">
                    {roundData.round.course.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(roundData.round.round_date)} - Score:{" "}
                    {roundData.final_adjusted_score}
                  </div>
                  <div className="text-xs text-gray-500">
                    Rating: {roundData.round.tee.course_rating} / Slope:{" "}
                    {roundData.round.tee.slope_rating}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xl font-bold text-gray-900">
                    {roundData.score_differential.toFixed(1)}
                  </div>
                  <div className="text-xs text-gray-500">Differential</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* No Rounds State */}
      {!handicap && recentRounds.length === 0 && !error && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Handicap Yet</h3>
          <p className="text-gray-500 mb-4">
            Complete at least 3 rounds to establish your handicap index.
          </p>
        </div>
      )}
    </div>
  );
}
