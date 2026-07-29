"use client";

import Link from "next/link";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";

interface RoundCardProps {
  id: string;
  round_date: string;
  round_type: string;
  format?: string;
  status: string;
  course_name: string;
  course_city?: string | null;
  course_state?: string | null;
  tee_name: string;
  tee_color?: string | null;
  par: number;
  final_score: number | null;
  score_to_par: number | null;
  score_differential: number | null;
  is_incomplete?: boolean;
  holes_played?: number;
  expected_holes?: number;
}


function formatDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function RoundCard(props: RoundCardProps) {
  const {
    id, round_date, round_type, format, status, course_name,
    tee_name, tee_color, par, final_score, score_to_par, score_differential,
    is_incomplete, holes_played, expected_holes,
  } = props;
  const isScramble = format === "scramble";

  return (
    <Link
      href={`/my-rounds/rounds/${id}`}
      className={`block bg-white border rounded-lg p-4 hover:shadow-sm transition-all ${
        status === "in_progress" ? "border-green-300 bg-green-50/30" : "border-gray-200 hover:border-green-300"
      }`}
    >
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="font-medium text-gray-900">{course_name}</div>
          <div className="flex items-center gap-2 text-sm text-gray-500 mt-0.5">
            <span>{formatDate(round_date)}</span>
            <span>·</span>
            <span className="flex items-center gap-1">
              {(() => {
                const dot = getTeeDotStyle(tee_color);
                return <span className={`w-3 h-3 rounded-full inline-block ${dot.className || ""}`} style={dot.style} />;
              })()}
              {tee_name}
            </span>
            {round_type !== "18" && (
              <>
                <span>·</span>
                <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                  {round_type === "9-front" ? "Front 9" : "Back 9"}
                </span>
              </>
            )}
            {isScramble && (
              <>
                <span>·</span>
                <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-1.5 py-0.5 rounded font-medium">
                  Scramble
                </span>
              </>
            )}
            {is_incomplete && (
              <>
                <span>·</span>
                <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                  Incomplete
                </span>
              </>
            )}
          </div>
        </div>

        <div className="text-right ml-4">
          {final_score != null ? (
            <>
              <div className="text-xl font-bold text-gray-900">{final_score}</div>
              {is_incomplete ? (
                <div className="text-xs font-medium text-amber-700">
                  {holes_played} of {expected_holes} holes
                </div>
              ) : (
                <div className={`text-sm font-medium ${
                  (score_to_par || 0) > 0 ? "text-red-600"
                  : (score_to_par || 0) < 0 ? "text-green-600"
                  : "text-gray-600"
                }`}>
                  {(score_to_par || 0) > 0 ? "+" : ""}{score_to_par ?? "E"}
                </div>
              )}
            </>
          ) : (
            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
              {status === "in_progress" ? "In Progress" : status}
            </span>
          )}
        </div>
      </div>

      {isScramble ? (
        <div className="mt-2 text-xs text-gray-400">
          Team score · Par {par} · Not counted toward handicap
        </div>
      ) : is_incomplete ? (
        <div className="mt-2 text-xs text-gray-400">
          Partial round · Not counted toward stats or handicap
        </div>
      ) : score_differential != null ? (
        <div className="mt-2 text-xs text-gray-400">
          Differential: {score_differential.toFixed(1)} · Par {par}
        </div>
      ) : null}
    </Link>
  );
}
