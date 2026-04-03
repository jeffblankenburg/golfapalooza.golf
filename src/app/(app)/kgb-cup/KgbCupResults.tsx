"use client";

import { useState, useEffect } from "react";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { KgbCupScoreboard, KgbCupGroupResults, type KgbGroupData } from "@/components/kgb-cup/KgbCupResultsView";
import type { FoursomeResult, OverallResult } from "@/lib/kgb-cup/match-logic";

interface TeamInfo {
  id: string;
  team_number: number;
  team_name: string;
  team_color: string | null;
}

interface PairData {
  id: string;
  player_a: string;
  player_b: string;
}

interface EnrichedFoursome {
  id: string;
  sort_order: number;
  team1_pair: PairData | null;
  team2_pair: PairData | null;
  results: FoursomeResult;
}

interface ResultsData {
  teams: TeamInfo[];
  foursomes: EnrichedFoursome[];
  overall: OverallResult;
  verified?: boolean;
}

export function KgbCupResults({ contestId }: { contestId: string }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchResults() {
      try {
        const res = await fetch(`/api/kgb-cup/results?contest_id=${contestId}`);
        if (!res.ok) {
          setError("Failed to load results");
          return;
        }
        const json = await res.json();
        setData(json);
      } catch {
        setError("Failed to load results");
      } finally {
        setLoading(false);
      }
    }
    fetchResults();
  }, [contestId]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">KGB Cup</h1>
        <p className="text-gray-500 text-center py-8">{error || "No data available."}</p>
      </div>
    );
  }

  const { teams, foursomes, overall } = data;
  const team1 = teams.find((t) => t.team_number === 1);
  const team2 = teams.find((t) => t.team_number === 2);
  const team1Color = team1?.team_color || "#3b82f6";
  const team2Color = team2?.team_color || "#ef4444";

  const groups: KgbGroupData[] = foursomes.map((f) => ({
    id: f.id,
    sort_order: f.sort_order,
    team1PairLabel: f.team1_pair
      ? [f.team1_pair.player_a, f.team1_pair.player_b].filter(Boolean).join(" & ")
      : "TBD",
    team2PairLabel: f.team2_pair
      ? [f.team2_pair.player_a, f.team2_pair.player_b].filter(Boolean).join(" & ")
      : "TBD",
    results: f.results,
  }));

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <KgbCupScoreboard
        team1={{ team_number: 1, team_name: team1?.team_name || "Team 1", team_color: team1Color }}
        team2={{ team_number: 2, team_name: team2?.team_name || "Team 2", team_color: team2Color }}
        overall={overall}
        verified={data.verified}
      >
        <div className="flex items-center justify-center gap-2 mb-4">
          <h1 className="text-lg font-bold text-gray-900">KGB Cup</h1>
          <PinnedNoteButton pinnedTo="kgb_cup" />
        </div>
      </KgbCupScoreboard>

      <KgbCupGroupResults groups={groups} team1Color={team1Color} team2Color={team2Color} />
    </div>
  );
}
