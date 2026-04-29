"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import ScoringShell, { type HoleInfo } from "@/components/scoring/ScoringShell";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import {
  CourseData,
  HoleData,
} from "@/lib/course-data";
import { getTeeColorClasses } from "@/lib/tee-colors";
import { formatCourseName } from "@/lib/utils/course-display";

function toHoleInfo(h: HoleData, fallbackTeeColor: string | null): HoleInfo {
  return {
    hole_number: h.number,
    hole_name: h.holeName ?? null,
    par: h.par,
    handicap_index: h.handicap,
    yards: h.yards,
    tee_color: h.teeColor ?? fallbackTeeColor,
    overhead_image_url: h.overheadImageUrl,
    green_image_url: h.greenImageUrl,
    tee_latitude: h.teeLatitude ?? null,
    tee_longitude: h.teeLongitude ?? null,
    green_latitude: h.greenLatitude ?? null,
    green_longitude: h.greenLongitude ?? null,
    center_line: h.centerLine ?? null,
  };
}

export function CourseScorecard({ course, closeHref = "/" }: { course: CourseData; closeHref?: string }) {
  const router = useRouter();
  const [selectedTeeId, setSelectedTeeId] = useState(course.defaultTeeId);

  const selectedTee = course.tees.find((t) => t.id === selectedTeeId);
  const holes = course.holesByTee[selectedTeeId] || [];
  const holeInfos = holes.map((h) => toHoleInfo(h, selectedTee?.color ?? null));

  if (holeInfos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <p className="text-gray-500 text-lg font-medium">No holes set up for this tee.</p>
      </div>
    );
  }

  // Mini scorecard rows: par, handicap, yards (no scores). Mirrors LiveScorer's
  // structure, including Out / In / Tot separator cells.
  const renderScorecardRows = (rowHoles: HoleInfo[]) => {
    const hasBothNines = rowHoles.length > 9 && rowHoles[0]?.hole_number <= 9;
    const front = hasBothNines ? rowHoles.filter((h) => h.hole_number <= 9) : [];
    const back = hasBothNines ? rowHoles.filter((h) => h.hole_number > 9) : [];

    const front9Par = front.reduce((s, h) => s + h.par, 0);
    const back9Par = back.reduce((s, h) => s + h.par, 0);
    const totalPar = rowHoles.reduce((s, h) => s + h.par, 0);

    const front9Yds = front.reduce((s, h) => s + (h.yards ?? 0), 0);
    const back9Yds = back.reduce((s, h) => s + (h.yards ?? 0), 0);
    const totalYds = rowHoles.reduce((s, h) => s + (h.yards ?? 0), 0);

    return (
      <>
        {/* Par row */}
        <tr className="border-t border-gray-100">
          {rowHoles.map((h) => (
            <Fragment key={`par-${h.hole_number}`}>
              {h.hole_number === 10 && hasBothNines && (
                <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-r border-gray-200">
                  {front9Par}
                </td>
              )}
              <td className="px-0 py-0.5 text-center text-gray-400">{h.par}</td>
            </Fragment>
          ))}
          {hasBothNines && (
            <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-r border-gray-200">
              {back9Par}
            </td>
          )}
          <td className="px-0 py-0.5 text-center font-bold text-gray-400 border-l border-gray-200">
            {totalPar}
          </td>
        </tr>
        {/* Handicap row */}
        <tr className="border-t border-gray-100">
          {rowHoles.map((h) => (
            <Fragment key={`hdcp-${h.hole_number}`}>
              {h.hole_number === 10 && hasBothNines && (
                <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
              )}
              <td className="px-0 py-0.5 text-center text-gray-300">{h.handicap_index}</td>
            </Fragment>
          ))}
          {hasBothNines && (
            <td className="px-0 py-0.5 text-center text-gray-300 border-l border-r border-gray-200" />
          )}
          <td className="px-0 py-0.5 text-center text-gray-300 border-l border-gray-200" />
        </tr>
        {/* Yards row */}
        <tr className="border-t border-gray-100">
          {rowHoles.map((h) => (
            <Fragment key={`yds-${h.hole_number}`}>
              {h.hole_number === 10 && hasBothNines && (
                <td className="px-0 py-0.5 text-center text-[9px] text-gray-400 border-l border-r border-gray-200">
                  {front9Yds || ""}
                </td>
              )}
              <td className="px-0 py-0.5 text-center text-[9px] text-gray-400">
                {h.yards ?? "—"}
              </td>
            </Fragment>
          ))}
          {hasBothNines && (
            <td className="px-0 py-0.5 text-center text-[9px] text-gray-400 border-l border-r border-gray-200">
              {back9Yds || ""}
            </td>
          )}
          <td className="px-0 py-0.5 text-center text-[9px] text-gray-400 border-l border-gray-200">
            {totalYds || ""}
          </td>
        </tr>
      </>
    );
  };

  // Bottom panel: course/tee context — no score inputs.
  const renderBottomPanel = () => (
    <div className="px-4 py-3 space-y-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold text-gray-900 truncate">
          {formatCourseName(course)}
        </h2>
        <PinnedNoteButton pinnedTo="course" />
      </div>
      {course.location && (
        <p className="text-xs text-gray-500">{course.location}</p>
      )}

      {course.tees.length > 1 ? (
        <div className="flex items-center gap-1.5 overflow-x-auto py-1 -mx-1 px-1">
          {course.tees.map((tee) => {
            const colors = getTeeColorClasses(tee.color);
            const isSelected = tee.id === selectedTeeId;
            return (
              <button
                key={tee.id}
                onClick={() => setSelectedTeeId(tee.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0 ${
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
      ) : null}

      {selectedTee && (
        <div className="flex items-center gap-3 text-[11px] text-gray-500">
          <span>Rating <span className="font-semibold text-gray-700">{selectedTee.rating}</span></span>
          <span>Slope <span className="font-semibold text-gray-700">{selectedTee.slope}</span></span>
          <span>Par <span className="font-semibold text-gray-700">{selectedTee.par}</span></span>
        </div>
      )}
    </div>
  );

  return (
    <ScoringShell
      holes={holeInfos}
      onClose={() => router.push(closeHref)}
      teeColor={selectedTee?.color ?? null}
      renderScorecardRows={renderScorecardRows}
      renderScorePanel={renderBottomPanel}
    />
  );
}
