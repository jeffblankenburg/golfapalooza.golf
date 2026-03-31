"use client";

import { useState } from "react";
import {
  CourseData,
  HoleData,
  getFrontNine,
  getBackNine,
  getNinePar,
  getNineYards,
} from "@/lib/course-data";
import { getTeeColorClasses } from "@/lib/tee-colors";
import { HoleDetailModal } from "./HoleDetailModal";

function NineTable({
  label,
  holes,
  totalLabel,
  onHoleSelect,
}: {
  label: string;
  holes: HoleData[];
  totalLabel: string;
  onHoleSelect: (hole: number) => void;
}) {
  const totalPar = getNinePar(holes);
  const totalYards = getNineYards(holes);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-center text-[11px]">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="py-2 px-1.5 text-left text-gray-500 font-medium w-10">
                Hole
              </th>
              {holes.map((hole) => (
                <th key={hole.number} className="py-2 px-0.5 min-w-[30px]">
                  <button
                    onClick={() => onHoleSelect(hole.number)}
                    className="w-full py-1 px-1 rounded-lg bg-emerald-50 text-emerald-700 font-bold active:bg-emerald-100 transition-colors"
                  >
                    {hole.number}
                  </button>
                </th>
              ))}
              <th className="py-2 px-1.5 text-gray-500 font-semibold bg-gray-50 min-w-[36px]">
                {totalLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-gray-50">
              <td className="py-2 px-1.5 text-left text-gray-500 font-medium">
                Par
              </td>
              {holes.map((hole) => (
                <td
                  key={hole.number}
                  className="py-2 px-0.5 font-semibold text-gray-900"
                >
                  {hole.par}
                </td>
              ))}
              <td className="py-2 px-1.5 font-bold text-gray-900 bg-gray-50">
                {totalPar}
              </td>
            </tr>
            <tr className="border-b border-gray-50">
              <td className="py-2 px-1.5 text-left text-gray-500 font-medium">
                Hdcp
              </td>
              {holes.map((hole) => (
                <td key={hole.number} className="py-2 px-0.5 text-gray-600">
                  {hole.handicap}
                </td>
              ))}
              <td className="py-2 px-1.5 bg-gray-50" />
            </tr>
            <tr>
              <td className="py-2 px-1.5 text-left text-gray-500 font-medium">
                Yds
              </td>
              {holes.map((hole) => (
                <td key={hole.number} className="py-2 px-0.5 text-gray-600">
                  {hole.yards}
                </td>
              ))}
              <td className="py-2 px-1.5 font-bold text-gray-900 bg-gray-50">
                {totalYards}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CourseScorecard({ course }: { course: CourseData }) {
  const [selectedTeeId, setSelectedTeeId] = useState(course.defaultTeeId);
  const [selectedHole, setSelectedHole] = useState<number | null>(null);

  const selectedTee = course.tees.find((t) => t.id === selectedTeeId);
  const holes = course.holesByTee[selectedTeeId] || [];
  const front = getFrontNine(holes);
  const back = getBackNine(holes);
  const totalPar = selectedTee?.par || getNinePar(front) + getNinePar(back);
  const totalYards = getNineYards(front) + getNineYards(back);

  return (
    <div className="px-4 pt-4 space-y-5">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{course.name}</h1>
        <p className="text-gray-500 mt-1">{course.location}</p>
      </div>

      {/* Tee Selector */}
      {course.tees.length > 1 ? (
        <div className="flex items-center gap-2 overflow-x-auto py-1 px-1 -mx-1">
          {course.tees.map((tee) => {
            const colors = getTeeColorClasses(tee.color);
            const isSelected = tee.id === selectedTeeId;
            return (
              <button
                key={tee.id}
                onClick={() => setSelectedTeeId(tee.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors shrink-0 ${
                  isSelected
                    ? `${colors.isCustom ? "" : colors.bg} ${colors.text} ring-2 ${colors.isCustom ? "" : colors.ring} ring-offset-1`
                    : `${colors.isCustom ? "" : colors.bg} ${colors.text} opacity-50`
                }`}
                style={colors.isCustom ? {
                  backgroundColor: colors.hex!,
                  ...(isSelected ? { boxShadow: `0 0 0 2px white, 0 0 0 4px ${colors.hex}` } : {}),
                } : undefined}
              >
                {tee.name}
              </button>
            );
          })}
        </div>
      ) : selectedTee ? (() => {
        const colors = getTeeColorClasses(selectedTee.color);
        return (
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`px-3 py-1 rounded-full font-semibold ${colors.isCustom ? "" : colors.bg} ${colors.text}`}
              style={colors.isCustom ? { backgroundColor: colors.hex! } : undefined}
            >
              {selectedTee.name} Tees
            </span>
          </div>
        );
      })() : null}

      {/* Tee info */}
      {selectedTee && (
        <div className="flex items-center gap-4 text-xs text-gray-500">
          <span>Rating {selectedTee.rating}</span>
          <span>Slope {selectedTee.slope}</span>
          <span>Par {selectedTee.par}</span>
        </div>
      )}

      {/* Hint */}
      <p className="text-xs text-gray-400">
        Tap a hole number to see the overhead view
      </p>

      {/* Front Nine */}
      <NineTable
        label="Front Nine"
        holes={front}
        totalLabel="Out"
        onHoleSelect={setSelectedHole}
      />

      {/* Back Nine */}
      <NineTable
        label="Back Nine"
        holes={back}
        totalLabel="In"
        onHoleSelect={setSelectedHole}
      />

      {/* Total */}
      <div className="flex justify-between items-center px-4 py-3 bg-emerald-700 rounded-2xl text-white">
        <span className="font-semibold">Total</span>
        <div className="flex gap-6 text-sm">
          <span>Par {totalPar}</span>
          <span>{totalYards} yds</span>
        </div>
      </div>

      {/* Hole Detail Modal */}
      {selectedHole !== null && (
        <HoleDetailModal
          holes={holes}
          initialHole={selectedHole}
          onClose={() => setSelectedHole(null)}
        />
      )}
    </div>
  );
}
