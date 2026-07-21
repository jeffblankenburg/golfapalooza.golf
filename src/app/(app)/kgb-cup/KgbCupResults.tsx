"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { KgbCupScoreboard, KgbCupGroupResults, type KgbGroupData } from "@/components/kgb-cup/KgbCupResultsView";
import { KgbCupHeader } from "@/components/kgb-cup/KgbCupHeader";
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
  player_c: string;
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

export function KgbCupResults({ contestId, headerAction }: { contestId: string; headerAction?: React.ReactNode }) {
  const [data, setData] = useState<ResultsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const topBar = (
    <div className="flex items-center justify-between">
      <Link
        href="/"
        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 active:bg-gray-200 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Home
      </Link>
      {headerAction}
    </div>
  );

  // Live results poll every 15s so scores tick up during active play without a
  // manual refresh. First load surfaces the spinner / any error; later polls
  // update silently (never clear existing data on a transient failure).
  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch(`/api/kgb-cup/results?contest_id=${contestId}`);
      if (!res.ok) {
        setError((prev) => prev ?? "Failed to load results");
        return;
      }
      const json = await res.json();
      setData(json);
      setError(null);
    } catch {
      setError((prev) => prev ?? "Failed to load results");
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, 15000);
    return () => clearInterval(interval);
  }, [fetchResults]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="px-4 pt-6 space-y-4">
        {topBar}
        <KgbCupHeader />
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
      ? [f.team1_pair.player_a, f.team1_pair.player_b, f.team1_pair.player_c].filter(Boolean).join(" & ")
      : "",
    team2PairLabel: f.team2_pair
      ? [f.team2_pair.player_a, f.team2_pair.player_b, f.team2_pair.player_c].filter(Boolean).join(" & ")
      : "",
    results: f.results,
  }));

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      {topBar}
      <KgbCupHeader size={120}>
        <PinnedNoteButton pinnedTo="kgb_cup" />
      </KgbCupHeader>

      <KgbCupScoreboard
        team1={{ team_number: 1, team_name: team1?.team_name || "Team 1", team_color: team1Color }}
        team2={{ team_number: 2, team_name: team2?.team_name || "Team 2", team_color: team2Color }}
        overall={overall}
        verified={data.verified}
      />

      <KgbCupGroupResults groups={groups} team1Color={team1Color} team2Color={team2Color} />
    </div>
  );
}
