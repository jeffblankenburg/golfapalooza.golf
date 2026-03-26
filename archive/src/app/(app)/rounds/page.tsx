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
    score_differential: number | null;
    user: {
      id: string;
      display_name: string;
    };
  }[];
}

export default function RoundsHistoryPage() {
  const [rounds, setRounds] = useState<Round[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "completed" | "in_progress">("all");

  useEffect(() => {
    async function fetchRounds() {
      setIsLoading(true);
      try {
        const url =
          filter === "all"
            ? "/api/rounds?limit=50"
            : `/api/rounds?status=${filter}&limit=50`;
        const response = await fetch(url);
        const data = await response.json();
        if (response.ok) {
          setRounds(data.rounds || []);
        }
      } catch (err) {
        console.error("Failed to fetch rounds:", err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchRounds();
  }, [filter]);

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

  const getStatusBadge = (status: string) => {
    if (status === "completed") {
      return (
        <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded">
          Completed
        </span>
      );
    }
    return (
      <span className="bg-yellow-100 text-yellow-700 text-xs font-medium px-2 py-1 rounded">
        In Progress
      </span>
    );
  };

  // Group rounds by month
  const groupedRounds = rounds.reduce(
    (groups, round) => {
      const date = new Date(round.round_date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const label = date.toLocaleDateString("en-US", { year: "numeric", month: "long" });

      if (!groups[key]) {
        groups[key] = { label, rounds: [] };
      }
      groups[key].rounds.push(round);
      return groups;
    },
    {} as Record<string, { label: string; rounds: Round[] }>
  );

  const sortedGroups = Object.entries(groupedRounds).sort((a, b) => b[0].localeCompare(a[0]));

  return (
    <div className="p-4 pb-24">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Round History</h1>
        <Link
          href="/scoring/new"
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg font-medium text-sm"
        >
          New Round
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex bg-gray-100 rounded-lg p-1 mb-6">
        {[
          { value: "all", label: "All" },
          { value: "completed", label: "Completed" },
          { value: "in_progress", label: "Active" },
        ].map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => setFilter(option.value as typeof filter)}
            className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
              filter === option.value
                ? "bg-white text-green-700 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
        </div>
      ) : rounds.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No Rounds Found</h3>
          <p className="text-gray-500 mb-4">
            {filter === "all"
              ? "You haven't played any rounds yet."
              : filter === "completed"
              ? "No completed rounds found."
              : "No active rounds found."}
          </p>
          <Link
            href="/scoring/new"
            className="inline-flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-6 py-3 rounded-lg font-medium"
          >
            Start Your First Round
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {sortedGroups.map(([key, group]) => (
            <section key={key}>
              <h2 className="text-lg font-semibold text-gray-800 mb-3">{group.label}</h2>
              <div className="space-y-3">
                {group.rounds.map((round) => (
                  <Link
                    key={round.id}
                    href={
                      round.status === "completed"
                        ? `/rounds/${round.id}`
                        : `/scoring/${round.id}`
                    }
                    className="block bg-white border border-gray-200 rounded-lg p-4 hover:border-green-300 transition-colors"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h3 className="font-semibold text-gray-900">{round.course.name}</h3>
                        <p className="text-sm text-gray-500">
                          {round.course.city}, {round.course.state}
                        </p>
                      </div>
                      {getStatusBadge(round.status)}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-gray-600 mb-3">
                      <span>{formatDate(round.round_date)}</span>
                      <span>{round.tee.tee_name}</span>
                      <span>{getRoundTypeLabel(round.round_type)}</span>
                    </div>

                    {round.status === "completed" && (
                      <div className="flex items-center gap-4 pt-3 border-t border-gray-100">
                        {round.players.map((player) => (
                          <div key={player.id} className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">
                              {player.user.display_name}:
                            </span>
                            <span className="font-semibold text-gray-900">
                              {player.final_gross_score || "-"}
                            </span>
                            {player.score_differential !== null && (
                              <span className="text-xs text-gray-500">
                                ({player.score_differential.toFixed(1)})
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
