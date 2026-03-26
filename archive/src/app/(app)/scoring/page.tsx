"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Round {
  id: string;
  round_date: string;
  round_type: string;
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
  };
  players: {
    id: string;
    user_id: string;
    final_gross_score: number | null;
    user: {
      id: string;
      display_name: string;
    };
  }[];
}

export default function ScoringPage() {
  const [activeRounds, setActiveRounds] = useState<Round[]>([]);
  const [recentRounds, setRecentRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchRounds() {
      try {
        // Fetch in-progress rounds
        const activeRes = await fetch("/api/rounds?status=in_progress&limit=10");
        const activeData = await activeRes.json();
        if (activeRes.ok) {
          setActiveRounds(activeData.rounds || []);
        }

        // Fetch recent completed rounds
        const recentRes = await fetch("/api/rounds?status=completed&limit=5");
        const recentData = await recentRes.json();
        if (recentRes.ok) {
          setRecentRounds(recentData.rounds || []);
        }
      } catch (err) {
        console.error("Failed to fetch rounds:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRounds();
  }, []);

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
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
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Scoring</h1>
        <Link
          href="/scoring/new"
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Round
        </Link>
      </div>

      {/* Active Rounds */}
      {activeRounds.length > 0 && (
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Active Rounds</h2>
          <div className="space-y-3">
            {activeRounds.map((round) => (
              <Link
                key={round.id}
                href={`/scoring/${round.id}`}
                className="block bg-white border border-green-200 rounded-lg p-4 hover:border-green-400 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
                    In Progress
                  </span>
                  <span className="text-sm text-gray-500">
                    {formatDate(round.round_date)}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">{round.course.name}</h3>
                <p className="text-sm text-gray-500">
                  {round.tee.tee_name} - {getRoundTypeLabel(round.round_type)}
                </p>
                <div className="flex items-center gap-2 mt-2">
                  {round.players.map((player) => (
                    <span
                      key={player.id}
                      className="inline-flex items-center px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded-full"
                    >
                      {player.user.display_name}
                    </span>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Empty State */}
      {activeRounds.length === 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center mb-8">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Active Rounds</h3>
          <p className="text-gray-500 mb-4">
            Start a new round to begin tracking your scores.
          </p>
          <Link
            href="/scoring/new"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Start New Round
          </Link>
        </div>
      )}

      {/* Recent Rounds */}
      {recentRounds.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-800">Recent Rounds</h2>
            <Link
              href="/rounds"
              className="text-sm text-green-600 hover:text-green-800 font-medium"
            >
              View All
            </Link>
          </div>
          <div className="space-y-3">
            {recentRounds.map((round) => (
              <Link
                key={round.id}
                href={`/rounds/${round.id}`}
                className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-500">
                    {formatDate(round.round_date)}
                  </span>
                  <span className="text-sm text-gray-500">
                    {getRoundTypeLabel(round.round_type)}
                  </span>
                </div>
                <h3 className="font-medium text-gray-900">{round.course.name}</h3>
                <div className="flex items-center gap-4 mt-2">
                  {round.players.map((player) => (
                    <div key={player.id} className="text-sm">
                      <span className="text-gray-600">{player.user.display_name}:</span>{" "}
                      <span className="font-medium text-gray-900">
                        {player.final_gross_score || "-"}
                      </span>
                    </div>
                  ))}
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
