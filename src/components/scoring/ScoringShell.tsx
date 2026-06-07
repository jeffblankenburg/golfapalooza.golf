"use client";

import { useState, useCallback, useEffect, Fragment, useMemo, type ReactNode } from "react";
import { TEE_HEX_COLORS } from "@/lib/utils/tee-colors";
import { useMusicPlayerOptional } from "@/contexts/MusicPlayerContext";
import { ScoringMapDrawer } from "./ScoringMapDrawer";

// Height the collapsed music mini-player occupies above the BottomNav
// (progress bar h-0.5 + content h-14 + border-t). Kept here so ScoringShell
// and ScoringMapDrawer can leave room for it when music is playing.
const MUSIC_MINI_HEIGHT = "3.625rem";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface HoleInfo {
  hole_number: number;
  hole_name?: string | null;
  par: number;
  handicap_index: number;
  yards: number | null;
  tee_color?: string | null;
  overhead_image_url?: string | null;
  green_image_url?: string | null;
  tee_latitude?: number | null;
  tee_longitude?: number | null;
  green_latitude?: number | null;
  green_longitude?: number | null;
  drive_latitude?: number | null;
  drive_longitude?: number | null;
  green_front_latitude?: number | null;
  green_front_longitude?: number | null;
  green_back_latitude?: number | null;
  green_back_longitude?: number | null;
  center_line?: [number, number][] | null;
  source_tee_color?: string | null;
}

interface ScoringShellProps {
  holes: HoleInfo[];
  startingHole?: number;
  onClose: () => void;

  // Slot: header right side (leaderboard button, progress counter, etc.)
  headerRight?: ReactNode;

  // Slot: mini scorecard rows (rendered inside <tbody> after hole numbers)
  renderScorecardRows: (holes: HoleInfo[], currentHoleNumber: number, goToHole: (index: number) => void) => ReactNode;

  // Optional leading column at index 0 of the scorecard (e.g., player initials).
  // When provided, the shell renders an extra <th> with this node in the header
  // row; consumers must include a matching leading <td> as the first cell of
  // every row in renderScorecardRows.
  scorecardLeadHeader?: ReactNode;

  // Slot: status banners (verified, closed, etc.)
  statusBanner?: ReactNode;

  // Slot: course name strip above bottom panel
  courseStrip?: ReactNode;

  // Slot: bottom scoring panel
  renderScorePanel: (hole: HoleInfo, holeIndex: number) => ReactNode;

  // Tee color for the round (used for map markers on non-composition tees)
  teeColor?: string | null;

  // Save status (shown as slide-down banner below the header)
  saveStatus?: SaveStatus;

  // Callback when hole changes
  onHoleChange?: (holeIndex: number, hole: HoleInfo) => void;
}

export default function ScoringShell({
  holes,
  startingHole,
  onClose,
  headerRight,
  renderScorecardRows,
  scorecardLeadHeader,
  statusBanner,
  courseStrip,
  renderScorePanel,
  teeColor: roundTeeColor,
  saveStatus = "idle",
  onHoleChange,
}: ScoringShellProps) {
  // Mixed tee colors → per-hole color in scorecard & map markers.
  const isCompositionTee = useMemo(() => {
    const colors = new Set(holes.map((h) => h.source_tee_color || h.tee_color).filter(Boolean));
    return colors.size > 1;
  }, [holes]);

  const initialIndex = startingHole
    ? Math.max(0, holes.findIndex((h) => h.hole_number === startingHole))
    : 0;

  const [currentHoleIndex, setCurrentHoleIndex] = useState(initialIndex);
  const [mapOpen, setMapOpen] = useState(false);

  // Music drawer reserves a strip just above the BottomNav while playing.
  // Shrink the shell so the strip stays visible. `useMusicPlayerOptional`
  // returns null outside the provider so this works in any embedding.
  const music = useMusicPlayerOptional();
  const musicVisible = !!music?.isVisible;
  const bottomReserved = musicVisible
    ? `calc(4rem + ${MUSIC_MINI_HEIGHT} + env(safe-area-inset-bottom))`
    : "calc(4rem + env(safe-area-inset-bottom))";

  const hole = holes[currentHoleIndex];

  const goToHole = useCallback((index: number) => {
    if (index < 0 || index >= holes.length) return;
    setCurrentHoleIndex(index);
  }, [holes.length]);

  useEffect(() => {
    if (onHoleChange && hole) onHoleChange(currentHoleIndex, hole);
  }, [currentHoleIndex, hole, onHoleChange]);

  if (!hole) return null;

  return (
    <div
      className="fixed top-14 left-0 right-0 z-50 bg-white flex flex-col"
      style={{ bottom: bottomReserved }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white shrink-0">
        <button
          onClick={onClose}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 shrink-0"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          <span className="font-bold text-gray-900 shrink-0">Hole {hole.hole_number}</span>
          <span className="w-px h-4 bg-gray-200 shrink-0" />
          <span className="shrink-0">Par <span className="font-bold text-gray-900">{hole.par}</span></span>
          <span className="w-px h-4 bg-gray-200 shrink-0" />
          <span className="shrink-0"><span className="font-bold text-gray-900">{hole.yards}</span> yds</span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
        </div>
      </div>

      {/* Mini Scorecard — always expanded (no drawer) */}
      <div className="overflow-x-auto border-t border-gray-200 bg-white shrink-0">
        <table
          className="w-full text-[10px]"
          style={{
            tableLayout: "fixed",
            minWidth: `${(holes.length + (holes.length > 9 ? 3 : 1) + (scorecardLeadHeader !== undefined ? 1 : 0)) * 34}px`,
          }}
        >
          <thead>
            <tr className="bg-gray-50">
              {scorecardLeadHeader !== undefined && (
                <th className="px-1 py-1 text-center font-bold text-gray-400 border-r border-gray-200 w-[28px]">
                  {scorecardLeadHeader}
                </th>
              )}
              {holes.map((h, i) => (
                <Fragment key={h.hole_number}>
                  {h.hole_number === 10 && holes[0]?.hole_number <= 9 && (
                    <th className="px-0 py-1 text-center font-bold text-gray-400 border-l border-r border-gray-200">Out</th>
                  )}
                  {(() => {
                    const isActive = h.hole_number === hole.hole_number;
                    const holeTeeColor = h.source_tee_color || h.tee_color;
                    const teeHex = isCompositionTee && holeTeeColor
                      ? TEE_HEX_COLORS[holeTeeColor] || null
                      : null;

                    if (teeHex) {
                      const isWhiteTee = teeHex === "#f3f4f6";
                      return (
                        <th
                          data-active={isActive}
                          onClick={() => goToHole(i)}
                          className="px-0 py-1 text-center font-bold cursor-pointer"
                          style={isActive
                            ? isWhiteTee
                              ? { backgroundColor: "#e5e7eb", color: "#374151", border: "1px solid #9ca3af" }
                              : { backgroundColor: teeHex, color: "white" }
                            : isWhiteTee
                              ? { backgroundColor: "#f9fafb", color: "#6b7280", border: "1px solid #d1d5db" }
                              : { backgroundColor: teeHex + "20", color: teeHex }
                          }
                        >
                          {h.hole_number}
                        </th>
                      );
                    }

                    return (
                      <th
                        data-active={isActive}
                        onClick={() => goToHole(i)}
                        className={`px-0 py-1 text-center font-bold cursor-pointer ${
                          isActive
                            ? "bg-green-600 text-white"
                            : "text-gray-500 hover:bg-gray-100"
                        }`}
                      >
                        {h.hole_number}
                      </th>
                    );
                  })()}
                </Fragment>
              ))}
              {holes.length > 9 && holes[0]?.hole_number <= 9 && (
                <th className="px-0 py-1 text-center font-bold text-gray-400 border-l border-r border-gray-200">In</th>
              )}
              <th className="px-0 py-1 text-center font-bold text-gray-400 border-l border-gray-200">Tot</th>
            </tr>
          </thead>
          <tbody>
            {renderScorecardRows(holes, hole.hole_number, goToHole)}
          </tbody>
        </table>
      </div>

      {/* Status banners (verified, closed, etc.) */}
      {statusBanner}

      {/* Hole name brass plate */}
      {hole.hole_name && (
        <div className="flex justify-center py-1.5 bg-white border-t border-gray-100 shrink-0">
          <span className="brass-plate">{hole.hole_name}</span>
        </div>
      )}

      {/* Course strip + save status overlay. When `courseStrip` is provided
          (LiveScoringEntry), the save banner overlays it. Otherwise (LiveScorer,
          KgbCup) the banner falls back to its own inline strip so save status
          remains visible. */}
      <div className="relative shrink-0">
        {courseStrip}
        <div
          className={`${courseStrip ? "absolute inset-0" : "relative"} z-10 flex items-center justify-center gap-1.5 text-xs font-medium transition-opacity duration-300 ${
            saveStatus === "idle"
              ? `opacity-0 pointer-events-none ${courseStrip ? "" : "h-0 overflow-hidden"}`
              : saveStatus === "saving"
                ? "opacity-100 bg-blue-50/95 text-blue-600 py-1"
                : saveStatus === "saved"
                  ? "opacity-100 bg-green-50/95 text-green-600 py-1"
                  : "opacity-100 bg-red-50/95 text-red-600 py-1"
          }`}
          aria-live="polite"
        >
          {saveStatus === "saving" && (
            <>
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Saving…
            </>
          )}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed — will retry"}
        </div>
      </div>

      {/* Nav row: prev chevron · Map pill · next chevron */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-3 py-2 bg-white border-t border-gray-100">
        <button
          type="button"
          onClick={() => goToHole(currentHoleIndex - 1)}
          disabled={currentHoleIndex === 0}
          aria-label="Previous hole"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <button
          type="button"
          onClick={() => setMapOpen(true)}
          className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gray-100 text-sm font-medium text-gray-700 active:bg-gray-200"
        >
          <span aria-hidden>🗺️</span>
          <span>Map</span>
        </button>

        <button
          type="button"
          onClick={() => goToHole(currentHoleIndex + 1)}
          disabled={currentHoleIndex === holes.length - 1}
          aria-label="Next hole"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Score panel — fills remaining height */}
      <div
        className="flex-1 min-h-0 overflow-y-auto bg-white border-t border-gray-200"
        style={{ paddingBottom: "max(0.5rem, calc(0.5rem + env(safe-area-inset-bottom)))" }}
      >
        {renderScorePanel(hole, currentHoleIndex)}
      </div>

      {/* Map drawer — mounted always so Mapbox stays warm; visually hidden until opened. */}
      <ScoringMapDrawer
        holes={holes}
        scorerHoleIndex={currentHoleIndex}
        isOpen={mapOpen}
        onClose={() => setMapOpen(false)}
        isCompositionTee={isCompositionTee}
        roundTeeColor={roundTeeColor}
        bottomReserved={musicVisible ? MUSIC_MINI_HEIGHT : "0px"}
      />
    </div>
  );
}

// Re-export types for consumers
export type { SaveStatus, HoleInfo as ScoringHoleInfo };
