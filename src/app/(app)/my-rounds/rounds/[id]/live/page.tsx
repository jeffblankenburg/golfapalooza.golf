"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LiveScoringEntry from "@/components/my-rounds/LiveScoringEntry";
import ScrambleScoringEntry from "@/components/my-rounds/ScrambleScoringEntry";
import { type HoleInfo } from "@/components/scoring/ScoringShell";

interface RoundData {
  id: string;
  round_type: string;
  format?: string;
  course: { name: string } | null;
  tee: { tee_name: string; tee_color: string | null } | null;
  round_players: {
    id: string;
    user_id: string | null;
    guest_name: string | null;
    user: { display_name: string } | null;
    tee: { tee_name: string; tee_color: string | null } | null;
    scores: { hole_number: number; strokes: number; putts: number | null }[];
  }[];
}

export default function LiveScoringResumePage() {
  const params = useParams();
  const router = useRouter();
  const roundId = params.id as string;

  const [data, setData] = useState<{
    round: RoundData;
    holes: HoleInfo[];
    players: { id: string; name: string; isGuest?: boolean; teeName?: string; teeColor?: string | null; roundPlayerId: string }[];
    initialScores: Record<string, Record<number, number>>;
    initialPutts: Record<string, Record<number, number>>;
    initialPlayerMap: Record<string, string>;
    courseName: string;
    roundType: string;
    format: string;
    teeColor: string | null;
    contestBadges: Record<number, string[]>;
    // Scramble-only: one team score per hole + the roster rows we fan it out to.
    scrambleTeamScores: Record<number, number>;
    scrambleRoundPlayerIds: string[];
    scrambleMembers: { id: string; name: string; isGuest?: boolean }[];
  } | null>(null);

  useEffect(() => {
    async function load() {
      const res = await fetch(`/api/rounds/${roundId}`);
      if (!res.ok) {
        router.push("/my-rounds");
        return;
      }

      const json = await res.json();
      const round = json.round;
      const holes = json.holes || [];
      const contestBadges: Record<number, string[]> = json.contest_holes || {};

      const course = Array.isArray(round.course) ? round.course[0] : round.course;
      const roundPlayers = round.round_players || [];

      // Canonical key: user_id for Loozers, `guest:<rpId>` for guests.
      const keyOf = (rp: RoundData["round_players"][0]) =>
        rp.user_id ?? `guest:${rp.id}`;

      // Build player list
      const players = roundPlayers.map((rp: RoundData["round_players"][0]) => {
        const user = Array.isArray(rp.user) ? rp.user[0] : rp.user;
        const tee = Array.isArray(rp.tee) ? rp.tee[0] : rp.tee;
        return {
          id: keyOf(rp),
          name: user?.display_name || rp.guest_name || "Player",
          isGuest: !rp.user_id,
          teeName: tee?.tee_name,
          teeColor: tee?.tee_color ?? null,
          roundPlayerId: rp.id,
        };
      });

      // Build initial scores and putts maps: playerKey -> { holeNumber -> value }
      const initialScores: Record<string, Record<number, number>> = {};
      const initialPutts: Record<string, Record<number, number>> = {};
      const initialPlayerMap: Record<string, string> = {};

      for (const rp of roundPlayers) {
        const key = keyOf(rp);
        initialPlayerMap[key] = rp.id;
        if (rp.scores && rp.scores.length > 0) {
          initialScores[key] = {};
          for (const s of rp.scores) {
            initialScores[key][s.hole_number] = s.strokes;
            if (s.putts != null) {
              if (!initialPutts[key]) initialPutts[key] = {};
              initialPutts[key][s.hole_number] = s.putts;
            }
          }
        }
      }

      // Get tee color from the round's tee
      const roundTee = Array.isArray(round.tee) ? round.tee[0] : round.tee;

      // Scramble: every roster row carries the same team score, so any one
      // player's scores reconstruct the team card. Fan-out targets = all rows.
      const scrambleTeamScores: Record<number, number> = {};
      const withScores = roundPlayers.find(
        (rp: RoundData["round_players"][0]) => rp.scores && rp.scores.length > 0,
      );
      if (withScores) {
        for (const s of withScores.scores) scrambleTeamScores[s.hole_number] = s.strokes;
      }
      const scrambleRoundPlayerIds = roundPlayers.map(
        (rp: RoundData["round_players"][0]) => rp.id,
      );
      const scrambleMembers = roundPlayers.map((rp: RoundData["round_players"][0]) => {
        const user = Array.isArray(rp.user) ? rp.user[0] : rp.user;
        return {
          id: rp.user_id ?? `guest:${rp.id}`,
          name: user?.display_name || rp.guest_name || "Player",
          isGuest: !rp.user_id,
        };
      });

      setData({
        round,
        holes,
        players,
        initialScores,
        initialPutts,
        initialPlayerMap,
        courseName: course?.name || "Unknown Course",
        roundType: round.round_type,
        format: round.format || "individual",
        teeColor: roundTee?.tee_color || null,
        contestBadges,
        scrambleTeamScores,
        scrambleRoundPlayerIds,
        scrambleMembers,
      });
    }
    load();
  }, [roundId, router]);

  if (!data) {
    return (
      <div className="fixed inset-0 z-50 bg-white flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (data.format === "scramble") {
    return (
      <ScrambleScoringEntry
        holes={data.holes}
        members={data.scrambleMembers}
        roundType={data.roundType}
        courseName={data.courseName}
        roundId={roundId}
        teeColor={data.teeColor}
        contestBadges={data.contestBadges}
        initialTeamScores={data.scrambleTeamScores}
        initialRoundPlayerIds={data.scrambleRoundPlayerIds}
        onClose={() => {
          router.push("/my-rounds");
          router.refresh();
        }}
      />
    );
  }

  return (
    <LiveScoringEntry
      holes={data.holes}
      players={data.players}
      roundType={data.roundType}
      courseName={data.courseName}
      roundId={roundId}
      teeColor={data.teeColor}
      initialScores={data.initialScores}
      initialPutts={data.initialPutts}
      initialPlayerMap={data.initialPlayerMap}
      contestBadges={data.contestBadges}
      onClose={() => {
        router.push("/my-rounds");
        router.refresh();
      }}
    />
  );
}
