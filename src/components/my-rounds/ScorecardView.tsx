"use client";

interface HoleData {
  hole_number: number;
  par: number;
  yards: number | null;
  handicap_index: number;
}

interface ScorecardViewProps {
  holes: HoleData[];
  scores: Record<number, number>;
  roundType: string;
}

function ScoreCell({ score, par }: { score: number | undefined; par: number }) {
  if (score == null) {
    return <span className="text-[10px] text-gray-400">·</span>;
  }

  const diff = score - par;

  // Eagle or better: double circle, green
  if (diff <= -2) {
    return (
      <div className="relative w-[22px] h-[22px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <div className="absolute inset-[3px] rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] font-bold text-green-700">{score}</span>
      </div>
    );
  }

  // Birdie: single circle, green
  if (diff === -1) {
    return (
      <div className="relative w-[18px] h-[18px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-full border-[1.5px] border-green-600" />
        <span className="relative z-10 text-[10px] font-bold text-green-700">{score}</span>
      </div>
    );
  }

  // Par: plain text
  if (diff === 0) {
    return <span className="text-[10px] font-bold text-gray-900">{score}</span>;
  }

  // Bogey: single square
  if (diff === 1) {
    return (
      <div className="relative w-[18px] h-[18px] flex items-center justify-center mx-auto">
        <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
        <span className="relative z-10 text-[10px] font-bold text-gray-900">{score}</span>
      </div>
    );
  }

  // Double bogey or worse: double square
  return (
    <div className="relative w-[22px] h-[22px] flex items-center justify-center mx-auto">
      <div className="absolute inset-0 rounded-sm border-[1.5px] border-gray-900" />
      <div className="absolute inset-[3px] rounded-sm border-[1.5px] border-gray-900" />
      <span className="relative z-10 text-[10px] font-bold text-gray-900">{score}</span>
    </div>
  );
}

export default function ScorecardView({ holes, scores, roundType }: ScorecardViewProps) {
  const frontNine = holes.filter((h) => h.hole_number <= 9);
  const backNine = holes.filter((h) => h.hole_number > 9);

  const showFront = roundType !== "9-back";
  const showBack = roundType !== "9-front";

  function renderNine(nineHoles: HoleData[], label: string) {
    const parTotal = nineHoles.reduce((sum, h) => sum + h.par, 0);
    const scoreTotal = nineHoles.reduce((sum, h) => sum + (scores[h.hole_number] || 0), 0);

    return (
      <div className="mb-3">
        <div className="text-xs font-semibold text-gray-500 mb-1">{label}</div>
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
                  <td key={h.hole_number} className="text-center py-1">{h.par}</td>
                ))}
                <td className="text-center py-1 font-medium border-l border-gray-200">{parTotal}</td>
              </tr>
              <tr>
                <td className="py-1.5 pr-2 text-gray-500"></td>
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

  return (
    <div>
      {showFront && frontNine.length > 0 && renderNine(frontNine, "Front 9")}
      {showBack && backNine.length > 0 && renderNine(backNine, "Back 9")}
    </div>
  );
}
