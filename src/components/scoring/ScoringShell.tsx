"use client";

import { useState, useRef, useCallback, useEffect, Fragment, type ReactNode } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";

const HoleMapViewLazy = dynamic(() => import("@/components/my-rounds/HoleMapView"), {
  ssr: false,
  loading: () => <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">Loading map...</div>,
});

type ImageView = "map" | "overhead" | "green";
type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface HoleInfo {
  hole_number: number;
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
}

interface ScoringShellProps {
  holes: HoleInfo[];
  startingHole?: number;
  onClose: () => void;

  // Slot: header right side (leaderboard button, progress counter, etc.)
  headerRight?: ReactNode;

  // Slot: mini scorecard rows (rendered inside <tbody> after hole numbers)
  renderScorecardRows: (holes: HoleInfo[], currentHoleNumber: number, goToHole: (index: number) => void) => ReactNode;

  // Slot: status banners (verified, closed, etc.)
  statusBanner?: ReactNode;

  // Slot: course name strip above bottom panel
  courseStrip?: ReactNode;

  // Slot: bottom scoring panel
  renderScorePanel: (hole: HoleInfo, holeIndex: number) => ReactNode;

  // Save status (shown as overlay on image area)
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
  statusBanner,
  courseStrip,
  renderScorePanel,
  saveStatus = "idle",
  onHoleChange,
}: ScoringShellProps) {
  // Find initial hole index
  const initialIndex = startingHole
    ? Math.max(0, holes.findIndex((h) => h.hole_number === startingHole))
    : 0;

  const [currentHoleIndex, setCurrentHoleIndex] = useState(initialIndex);
  const [imageView, setImageView] = useState<ImageView>("map");

  // Swipe + pinch state
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [isSnapBack, setIsSnapBack] = useState(false);
  const gestureRef = useRef({
    isPinching: false,
    isPanning: false,
    initialDist: 0,
    initialScale: 1,
    initialOffset: { x: 0, y: 0 },
    initialMid: { x: 0, y: 0 },
    panStart: { x: 0, y: 0 },
    panStartOffset: { x: 0, y: 0 },
  });

  const scorecardRef = useRef<HTMLDivElement>(null);

  const hole = holes[currentHoleIndex];

  const goToHole = useCallback((index: number) => {
    if (index < 0 || index >= holes.length) return;
    setIsAnimating(true);
    setDragOffset(0);
    setScale(1);
    setOffset({ x: 0, y: 0 });
    setCurrentHoleIndex(index);
    setTimeout(() => setIsAnimating(false), 300);

    if (scorecardRef.current) {
      const th = scorecardRef.current.querySelector(`[data-active="true"]`);
      if (th) th.scrollIntoView({ inline: "center", behavior: "smooth" });
    }
  }, [holes.length]);

  useEffect(() => {
    if (onHoleChange && hole) onHoleChange(currentHoleIndex, hole);
  }, [currentHoleIndex, hole, onHoleChange]);

  // View logic
  const hasMap = hole?.tee_latitude != null && hole?.tee_longitude != null;
  const hasOverhead = !!hole?.overhead_image_url;
  const hasGreen = !!hole?.green_image_url;
  const availableViews: { key: ImageView; label: string }[] = [
    ...(hasMap ? [{ key: "map" as const, label: "Map" }] : []),
    ...(hasOverhead ? [{ key: "overhead" as const, label: "Overhead" }] : []),
    ...(hasGreen ? [{ key: "green" as const, label: "Green" }] : []),
  ];
  const activeView = availableViews.find((v) => v.key === imageView)?.key
    || availableViews[0]?.key || null;
  const currentImageUrl = activeView === "overhead" ? hole?.overhead_image_url
    : activeView === "green" ? hole?.green_image_url : null;

  // Touch handlers
  function getDistance(t1: React.Touch, t2: React.Touch) {
    return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
  }

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      gestureRef.current = {
        isPinching: true,
        isPanning: false,
        initialDist: dist,
        initialScale: scale,
        initialOffset: { ...offset },
        initialMid: { x: midX, y: midY },
        panStart: { x: 0, y: 0 },
        panStartOffset: { x: 0, y: 0 },
      };
    } else if (e.touches.length === 1) {
      if (scale > 1) {
        gestureRef.current = {
          ...gestureRef.current,
          isPanning: true,
          isPinching: false,
          panStart: { x: e.touches[0].clientX, y: e.touches[0].clientY },
          panStartOffset: { ...offset },
        };
      } else {
        touchStartX.current = e.touches[0].clientX;
        touchStartY.current = e.touches[0].clientY;
        gestureRef.current.isPinching = false;
        gestureRef.current.isPanning = false;
      }
    }
  }

  function handleTouchMove(e: React.TouchEvent) {
    const g = gestureRef.current;

    if (g.isPinching && e.touches.length === 2) {
      e.preventDefault();
      const dist = getDistance(e.touches[0], e.touches[1]);
      const newScale = Math.max(1, Math.min(5, g.initialScale * (dist / g.initialDist)));
      setScale(newScale);

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      setOffset({
        x: g.initialOffset.x + (midX - g.initialMid.x),
        y: g.initialOffset.y + (midY - g.initialMid.y),
      });
    } else if (g.isPanning && e.touches.length === 1) {
      e.preventDefault();
      const dx = e.touches[0].clientX - g.panStart.x;
      const dy = e.touches[0].clientY - g.panStart.y;
      setOffset({ x: g.panStartOffset.x + dx, y: g.panStartOffset.y + dy });
    } else if (!g.isPinching && !g.isPanning && e.touches.length === 1 && scale === 1) {
      const dx = e.touches[0].clientX - touchStartX.current;
      const dy = e.touches[0].clientY - touchStartY.current;
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) {
        setDragOffset(dx);
      }
    }
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const g = gestureRef.current;

    if (g.isPinching) {
      if (e.touches.length < 2) {
        g.isPinching = false;
        if (scale < 1.1) {
          setIsSnapBack(true);
          setScale(1);
          setOffset({ x: 0, y: 0 });
          setTimeout(() => setIsSnapBack(false), 200);
        }
      }
    } else if (g.isPanning) {
      if (e.touches.length === 0) g.isPanning = false;
    } else if (scale === 1 && Math.abs(dragOffset) > 50) {
      if (dragOffset < 0 && currentHoleIndex < holes.length - 1) goToHole(currentHoleIndex + 1);
      else if (dragOffset > 0 && currentHoleIndex > 0) goToHole(currentHoleIndex - 1);
      else setDragOffset(0);
    } else {
      setDragOffset(0);
    }
  }

  if (!hole) return null;

  return (
    <div className="fixed inset-0 z-50 bg-white flex flex-col">
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

        <div className="flex items-center gap-3 text-sm text-gray-500">
          <span className="font-bold text-gray-900">Hole {hole.hole_number}</span>
          <span className="w-px h-4 bg-gray-200" />
          <span>Par <span className="font-bold text-gray-900">{hole.par}</span></span>
          <span className="w-px h-4 bg-gray-200" />
          <span><span className="font-bold text-gray-900">{hole.yards}</span> yds</span>
          <span className="w-px h-4 bg-gray-200" />
          <span>Hdcp <span className="font-bold text-gray-900">{hole.handicap_index}</span></span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {headerRight}
        </div>
      </div>

      {/* Mini Scorecard */}
      <div ref={scorecardRef} className="overflow-x-auto border-t border-gray-200 bg-white shrink-0">
        <table className="w-full text-[10px]" style={{ tableLayout: "fixed", minWidth: `${(holes.length + (holes.length > 9 ? 3 : 1)) * 34}px` }}>
          <thead>
            <tr className="bg-gray-50">
              {holes.map((h, i) => (
                <Fragment key={h.hole_number}>
                  {h.hole_number === 10 && holes[0]?.hole_number <= 9 && (
                    <th className="px-0 py-1 text-center font-bold text-gray-400 border-l border-r border-gray-200">Out</th>
                  )}
                  <th
                    data-active={h.hole_number === hole.hole_number}
                    onClick={() => goToHole(i)}
                    className={`px-0 py-1 text-center font-bold cursor-pointer ${
                      h.hole_number === hole.hole_number
                        ? "bg-green-600 text-white"
                        : "text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {h.hole_number}
                  </th>
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

      {/* Status banners */}
      {statusBanner}

      {/* View Toggle */}
      {availableViews.length > 1 && (
        <div className="flex justify-center py-1.5 bg-white border-t border-gray-100 shrink-0">
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            {availableViews.map((v) => (
              <button
                key={v.key}
                onClick={() => setImageView(v.key)}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  activeView === v.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Image/Map Area */}
      <div
        className="flex-1 min-h-0 overflow-hidden bg-white relative touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Save status overlay */}
        <div
          className={`absolute top-0 left-0 right-0 z-10 flex items-center justify-center gap-1.5 text-xs font-medium transition-all duration-300 ${
            saveStatus === "idle"
              ? "opacity-0 -translate-y-full pointer-events-none"
              : saveStatus === "saving"
              ? "opacity-100 translate-y-0 bg-blue-50/90 text-blue-600 py-1"
              : saveStatus === "saved"
              ? "opacity-100 translate-y-0 bg-green-50/90 text-green-600 py-1"
              : "opacity-100 translate-y-0 bg-red-50/90 text-red-600 py-1"
          }`}
        >
          {saveStatus === "saving" && (
            <>
              <div className="w-3 h-3 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              Saving...
            </>
          )}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed — will retry"}
        </div>

        {/* Navigation arrows */}
        {currentHoleIndex > 0 && (
          <button
            onClick={() => goToHole(currentHoleIndex - 1)}
            className="absolute left-2 top-1/2 -translate-y-1/2 z-[5] w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        )}
        {currentHoleIndex < holes.length - 1 && (
          <button
            onClick={() => goToHole(currentHoleIndex + 1)}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-[5] w-10 h-10 flex items-center justify-center rounded-full bg-black/50 text-white active:bg-black/70"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}

        <div
          className="w-full h-full relative"
          style={{
            transform: scale === 1
              ? `translateX(${dragOffset}px)`
              : `scale(${scale}) translate(${offset.x / scale}px, ${offset.y / scale}px)`,
            transition: isSnapBack
              ? "transform 0.2s ease-out"
              : isAnimating
              ? "transform 0.3s ease-out"
              : "none",
          }}
        >
          {activeView === "map" && hasMap ? (
            <div className="w-full h-full">
              <HoleMapViewLazy
                teeLatLng={[hole.tee_latitude!, hole.tee_longitude!]}
                greenLatLng={hole.green_latitude != null && hole.green_longitude != null
                  ? [hole.green_latitude, hole.green_longitude]
                  : null}
                driveLatLng={hole.drive_latitude != null && hole.drive_longitude != null
                  ? [hole.drive_latitude, hole.drive_longitude]
                  : null}
                greenFrontLatLng={hole.green_front_latitude != null && hole.green_front_longitude != null
                  ? [hole.green_front_latitude, hole.green_front_longitude]
                  : null}
                greenBackLatLng={hole.green_back_latitude != null && hole.green_back_longitude != null
                  ? [hole.green_back_latitude, hole.green_back_longitude]
                  : null}
                holeNumber={hole.hole_number}
                par={hole.par}
              />
            </div>
          ) : currentImageUrl ? (
            <Image
              key={`${hole.hole_number}-${activeView}`}
              src={currentImageUrl}
              alt={`Hole ${hole.hole_number} ${activeView} view`}
              fill
              className="object-contain animate-fade-in"
              priority
              sizes="(max-width: 768px) 100vw, 512px"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
              <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <p className="text-sm">No image</p>
            </div>
          )}
        </div>
      </div>

      {/* Course strip */}
      {courseStrip}

      {/* Bottom scoring panel */}
      <div
        className="shrink min-h-0 bg-white border-t border-gray-200 overflow-y-auto"
        style={{ paddingBottom: "max(0.5rem, calc(0.5rem + env(safe-area-inset-bottom)))", maxHeight: "45vh" }}
      >
        {renderScorePanel(hole, currentHoleIndex)}
      </div>
    </div>
  );
}

// Re-export types for consumers
export type { ImageView, SaveStatus, HoleInfo as ScoringHoleInfo };
