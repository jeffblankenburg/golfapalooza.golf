"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import LiveScoringEntry from "@/components/my-rounds/LiveScoringEntry";
import { type HoleInfo } from "@/components/scoring/ScoringShell";

interface RoundData {
  id: string;
  round_type: string;
  course: { name: string } | null;
  tee: { tee_name: string } | null;
  round_players: {
    id: string;
    user_id: string;
    user: { display_name: string } | null;
    tee: { tee_name: string } | null;
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
    players: { id: string; name: string; teeName?: string; roundPlayerId: string }[];
    initialScores: Record<string, Record<number, number>>;
    initialPutts: Record<string, Record<number, number>>;
    initialPlayerMap: Record<string, string>;
    courseName: string;
    roundType: string;
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

      const course = Array.isArray(round.course) ? round.course[0] : round.course;
      const roundPlayers = round.round_players || [];

      // Build player list
      const players = roundPlayers.map((rp: RoundData["round_players"][0]) => {
        const user = Array.isArray(rp.user) ? rp.user[0] : rp.user;
        const tee = Array.isArray(rp.tee) ? rp.tee[0] : rp.tee;
        return {
          id: rp.user_id,
          name: user?.display_name || "Player",
          teeName: tee?.tee_name,
          roundPlayerId: rp.id,
        };
      });

      // Build initial scores and putts maps: userId -> { holeNumber -> value }
      const initialScores: Record<string, Record<number, number>> = {};
      const initialPutts: Record<string, Record<number, number>> = {};
      const initialPlayerMap: Record<string, string> = {};

      for (const rp of roundPlayers) {
        initialPlayerMap[rp.user_id] = rp.id;
        if (rp.scores && rp.scores.length > 0) {
          initialScores[rp.user_id] = {};
          for (const s of rp.scores) {
            initialScores[rp.user_id][s.hole_number] = s.strokes;
            if (s.putts != null) {
              if (!initialPutts[rp.user_id]) initialPutts[rp.user_id] = {};
              initialPutts[rp.user_id][s.hole_number] = s.putts;
            }
          }
        }
      }

      setData({
        round,
        holes,
        players,
        initialScores,
        initialPutts,
        initialPlayerMap,
        courseName: course?.name || "Unknown Course",
        roundType: round.round_type,
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

  return (
    <LiveScoringEntry
      holes={data.holes}
      players={data.players}
      roundType={data.roundType}
      courseName={data.courseName}
      roundId={roundId}
      initialScores={data.initialScores}
      initialPutts={data.initialPutts}
      initialPlayerMap={data.initialPlayerMap}
      onClose={() => {
        router.push("/my-rounds");
        router.refresh();
      }}
    />
  );
}
