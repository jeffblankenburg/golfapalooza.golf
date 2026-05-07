"use client";

import { useEffect, useState } from "react";

interface HoleData {
  hole_number: number;
  par: number;
  yards: number | null;
  handicap_index: number;
}

interface Scorecard {
  round_player_id: string;
  round_id: string | null;
  played_at: string | null;
  round_type: string;
  course_name: string;
  tee_name: string | null;
  tee_color: string | null;
  par: number | null;
  final_gross_score: number | null;
  final_adjusted_score: number | null;
  score_differential: number | null;
  holes: HoleData[];
  scores: Record<number, number>;
}

function ScoreCell({ score, par }: { score: number | undefined; par: number }) {
  if (score == null) return <span className="text-[10px] text-gray-400">·</span>;
  const diff = score - par;
  if (diff <= -2) {
    return (
      <div className="relative w-[22px] h-[22px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <div className="absolute inset-[3px] rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] font-bold text-green-700">{score}</span>
      </div>
    );
  }
  if (diff === -1) {
    return (
      <div className="relative w-[18px] h-[18px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] font-bold text-green-700">{score}</span>
      </div>
    );
  }
  if (diff === 0) {
    return <span className="text-[10px] font-bold text-gray-900">{score}</span>;
  }
  if (diff === 1) {
    return (
      <div className="relative w-[18px] h-[18px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
        <span className="relative z-10 text-[10px] font-bold text-gray-900">{score}</span>
      </div>
    );
  }
  return (
    <div className="relative w-[22px] h-[22px] flex items-center justify-center mx-auto">
      <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
      <div className="absolute inset-[3px] rounded-sm border-[1.5px] border-gray-900" />
      <span className="relative z-10 text-[10px] font-bold text-gray-900">{score}</span>
    </div>
  );
}

function NineTable({
  nineHoles,
  scores,
  label,
}: {
  nineHoles: HoleData[];
  scores: Record<number, number>;
  label: string;
}) {
  if (nineHoles.length === 0) return null;
  const parTotal = nineHoles.reduce((sum, h) => sum + h.par, 0);
  const scoreTotal = nineHoles.reduce((sum, h) => sum + (scores[h.hole_number] || 0), 0);
  return (
    <div className="mb-3">
      <div className="text-[11px] font-semibold text-gray-500 mb-1">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-gray-500">
              <td className="py-1 pr-2 font-medium">Hole</td>
              {nineHoles.map((h) => (
                <td key={h.hole_number} className="text-center w-7 py-1 font-medium">
                  {h.hole_number}
                </td>
              ))}
              <td className="text-center w-9 py-1 font-bold border-l border-gray-200">
                {label.includes("Front") ? "Out" : "In"}
              </td>
            </tr>
          </thead>
          <tbody>
            <tr className="text-gray-500 border-b border-gray-100">
              <td className="py-1 pr-2">Par</td>
              {nineHoles.map((h) => (
                <td key={h.hole_number} className="text-center py-1">
                  {h.par}
                </td>
              ))}
              <td className="text-center py-1 font-medium border-l border-gray-200">{parTotal}</td>
            </tr>
            <tr>
              <td className="py-1.5 pr-2 text-gray-500">Score</td>
              {nineHoles.map((h) => (
                <td key={h.hole_number} className="text-center py-1.5">
                  <ScoreCell score={scores[h.hole_number]} par={h.par} />
                </td>
              ))}
              <td className="text-center py-1 font-bold text-gray-900 border-l border-gray-200">
                {scoreTotal || "–"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ScorecardAccordion({ card }: { card: Scorecard }) {
  const [open, setOpen] = useState(false);
  const date = card.played_at ? new Date(card.played_at) : null;
  const dateLabel = date
    ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })
    : "—";
  const front = card.holes.filter((h) => h.hole_number <= 9);
  const back = card.holes.filter((h) => h.hole_number > 9);
  const showFront = card.round_type !== "9-back";
  const showBack = card.round_type !== "9-front";
  const toPar =
    card.final_gross_score != null && card.par != null
      ? card.final_gross_score - card.par
      : null;

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3 py-2.5 flex items-center gap-3 text-left active:bg-gray-50"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900 truncate">{card.course_name}</p>
          <p className="text-[11px] text-gray-500 truncate">
            {dateLabel}
            {card.tee_name ? ` · ${card.tee_name}` : ""}
            {card.round_type !== "18" ? ` · ${card.round_type === "9-front" ? "Front 9" : "Back 9"}` : ""}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="text-base font-bold text-gray-900 leading-none">
            {card.final_gross_score ?? "—"}
          </p>
          {toPar != null && (
            <p
              className={`text-[10px] font-semibold ${
                toPar < 0 ? "text-green-700" : toPar === 0 ? "text-gray-500" : "text-gray-700"
              }`}
            >
              {toPar > 0 ? `+${toPar}` : toPar === 0 ? "E" : toPar}
            </p>
          )}
        </div>
        <svg
          className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${
            open ? "rotate-90" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {open && (
        <div className="px-3 pb-3 pt-1 border-t border-gray-100">
          {card.holes.length === 0 ? (
            <p className="text-[11px] text-gray-400 italic py-2">No hole-by-hole data for this round.</p>
          ) : (
            <>
              {showFront && <NineTable nineHoles={front} scores={card.scores} label="Front 9" />}
              {showBack && <NineTable nineHoles={back} scores={card.scores} label="Back 9" />}
            </>
          )}
          {card.score_differential != null && (
            <p className="text-[10px] text-gray-500 mt-1">
              Differential: <span className="font-semibold text-gray-700">{card.score_differential.toFixed(1)}</span>
              {card.final_adjusted_score != null && (
                <> · Adjusted: <span className="font-semibold text-gray-700">{card.final_adjusted_score}</span></>
              )}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export function UserScorecardsTab({ userId }: { userId: string }) {
  const [scorecards, setScorecards] = useState<Scorecard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/users/${userId}/scorecards`)
      .then((r) => r.json().then((d) => ({ ok: r.ok, d })))
      .then(({ ok, d }) => {
        if (cancelled) return;
        if (!ok) {
          setError(d.error || "Failed to load scorecards");
          setScorecards([]);
          return;
        }
        setScorecards(d.scorecards || []);
      })
      .catch(() => {
        if (!cancelled) {
          setError("Failed to load scorecards");
          setScorecards([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (scorecards === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-red-600 py-4">{error}</p>;
  }

  if (scorecards.length === 0) {
    return <p className="text-sm text-gray-400 italic py-6 text-center">No completed rounds yet.</p>;
  }

  return (
    <div className="space-y-2">
      {scorecards.map((card) => (
        <ScorecardAccordion key={card.round_player_id} card={card} />
      ))}
    </div>
  );
}
