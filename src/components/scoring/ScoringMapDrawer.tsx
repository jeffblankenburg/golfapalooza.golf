"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { TEE_HEX_COLORS } from "@/lib/utils/tee-colors";
import type { HoleInfo } from "./ScoringShell";

const HoleMapViewLazy = dynamic(() => import("@/components/my-rounds/HoleMapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">
      Loading map…
    </div>
  ),
});

type ImageView = "map" | "overhead" | "green";

interface ScoringMapDrawerProps {
  holes: HoleInfo[];
  scorerHoleIndex: number;
  isOpen: boolean;
  onClose: () => void;
  isCompositionTee: boolean;
  roundTeeColor?: string | null;
  // Measured bottom edge (px) of the top nav chrome — the drawer starts here so
  // its close controls never tuck under the header (which may be taller than
  // 56px with the SimulatorBanner or a device safe-area). Falls back to 3.5rem.
  topOffset?: number | null;
  // Extra reserved space above the BottomNav (e.g., when the music mini-player
  // is showing). The drawer ends just above this strip so the strip stays
  // visible behind it.
  bottomReserved?: string;
}

// Mounted continuously by ScoringShell so the Mapbox WebGL context warms up on
// page load. When `isOpen` is false the drawer slides off-screen but stays in
// the DOM, and its hole index follows the scorer's so that the first open lands
// on "now." While open, drawer-local chevrons drive the displayed hole via
// `override`; closing the drawer clears the override so the next reopen lands
// on the scorer's current hole again.
export function ScoringMapDrawer({
  holes,
  scorerHoleIndex,
  isOpen,
  onClose,
  isCompositionTee,
  roundTeeColor,
  topOffset = null,
  bottomReserved = "0px",
}: ScoringMapDrawerProps) {
  const [override, setOverride] = useState<number | null>(null);
  const drawerHoleIndex = override ?? scorerHoleIndex;
  const hole = holes[drawerHoleIndex] ?? holes[0];

  function closeDrawer() {
    setOverride(null);
    onClose();
  }

  // Restore the last view (Map / Overhead / Green) across reloads.
  const [imageView, setImageView] = useState<ImageView>(() => {
    if (typeof sessionStorage === "undefined") return "map";
    try {
      const raw = sessionStorage.getItem("scoring_image_view");
      return raw === "map" || raw === "overhead" || raw === "green" ? raw : "map";
    } catch {
      return "map";
    }
  });
  useEffect(() => {
    if (typeof sessionStorage === "undefined") return;
    try {
      sessionStorage.setItem("scoring_image_view", imageView);
    } catch {
      /* ignore */
    }
  }, [imageView]);

  // Drag-to-collapse on the handle, matching MusicDrawer.
  const dragStartYRef = useRef<number | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  function onHandleTouchStart(e: React.TouchEvent) {
    dragStartYRef.current = e.touches[0].clientY;
  }
  function onHandleTouchMove(e: React.TouchEvent) {
    if (dragStartYRef.current == null) return;
    const dy = e.touches[0].clientY - dragStartYRef.current;
    if (dy > 0) setDragOffset(dy);
  }
  function onHandleTouchEnd() {
    const start = dragStartYRef.current;
    dragStartYRef.current = null;
    const offset = dragOffset;
    setDragOffset(0);
    if (start != null && offset > 80) closeDrawer();
  }

  // Lock background scroll while open.
  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  const hasMap = hole?.tee_latitude != null && hole?.tee_longitude != null;
  const hasOverhead = !!hole?.overhead_image_url;
  const hasGreen = !!hole?.green_image_url;
  const availableViews = useMemo(
    () => [
      ...(hasMap ? [{ key: "map" as const, label: "Map" }] : []),
      ...(hasOverhead ? [{ key: "overhead" as const, label: "Overhead" }] : []),
      ...(hasGreen ? [{ key: "green" as const, label: "Green" }] : []),
    ],
    [hasMap, hasOverhead, hasGreen],
  );
  const activeView: ImageView | null =
    availableViews.find((v) => v.key === imageView)?.key || availableViews[0]?.key || null;
  const currentImageUrl =
    activeView === "overhead"
      ? hole?.overhead_image_url
      : activeView === "green"
        ? hole?.green_image_url
        : null;

  if (!hole) return null;

  const dotColor = isCompositionTee ? hole.source_tee_color || hole.tee_color : roundTeeColor;
  const dotHex = dotColor ? TEE_HEX_COLORS[dotColor] || null : null;

  return (
    <div
      className={`fixed inset-x-0 z-[55] bg-white flex flex-col transition-transform duration-300 ease-out ${
        isOpen ? "translate-y-0" : "translate-y-full pointer-events-none"
      }`}
      style={{
        top: topOffset ?? "3.5rem",
        bottom: bottomReserved,
        transform: isOpen ? `translateY(${dragOffset}px)` : undefined,
        transition: dragOffset > 0 ? "none" : undefined,
      }}
      aria-hidden={!isOpen}
    >
      {/* Drag handle + explicit close button. The handle alone wasn't a
          discoverable way out (looked like decoration), so a labeled ✕ button
          sits at the top-right of this bar and is always tappable. The bar has
          its own height so the button never overlaps the hole-nav row below. */}
      <div
        className="shrink-0 relative flex items-center justify-center bg-white min-h-[2.75rem]"
        onTouchStart={onHandleTouchStart}
        onTouchMove={onHandleTouchMove}
        onTouchEnd={onHandleTouchEnd}
      >
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close map"
          className="w-12 h-1.5 rounded-full bg-gray-300 active:bg-gray-400"
        />
        <button
          type="button"
          onClick={closeDrawer}
          aria-label="Close map"
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center gap-1 rounded-full bg-gray-900/85 text-white text-xs font-semibold pl-2 pr-2.5 py-1 shadow-lg active:bg-gray-900"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Close
        </button>
      </div>

      {/* Hole nav header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 bg-white shrink-0">
        <button
          type="button"
          onClick={() => setOverride(Math.max(0, drawerHoleIndex - 1))}
          disabled={drawerHoleIndex === 0}
          aria-label="Previous hole"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <div className="flex items-center gap-2 text-sm text-gray-500 min-w-0">
          {dotHex && (
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: dotHex, border: dotHex === "#f3f4f6" ? "1px solid #9ca3af" : undefined }}
            />
          )}
          <span className="font-bold text-gray-900">Hole {hole.hole_number}</span>
          {hole.hole_name && (
            <span className="text-gray-400 truncate">· {hole.hole_name}</span>
          )}
          <span className="w-px h-4 bg-gray-200 shrink-0" />
          <span className="shrink-0">Par <span className="font-bold text-gray-900">{hole.par}</span></span>
          <span className="w-px h-4 bg-gray-200 shrink-0" />
          <span className="shrink-0"><span className="font-bold text-gray-900">{hole.yards}</span> yds</span>
        </div>

        <button
          type="button"
          onClick={() => setOverride(Math.min(holes.length - 1, drawerHoleIndex + 1))}
          disabled={drawerHoleIndex === holes.length - 1}
          aria-label="Next hole"
          className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Imagery area */}
      <div className="flex-1 min-h-0 relative bg-white">
        {hasMap && (
          <div
            className={`absolute inset-0 ${activeView === "map" ? "" : "opacity-0 pointer-events-none"}`}
          >
            <HoleMapViewLazy
              teeLatLng={[hole.tee_latitude!, hole.tee_longitude!]}
              greenLatLng={
                hole.green_latitude != null && hole.green_longitude != null
                  ? [hole.green_latitude, hole.green_longitude]
                  : null
              }
              driveLatLng={
                hole.drive_latitude != null && hole.drive_longitude != null
                  ? [hole.drive_latitude, hole.drive_longitude]
                  : null
              }
              greenFrontLatLng={
                hole.green_front_latitude != null && hole.green_front_longitude != null
                  ? [hole.green_front_latitude, hole.green_front_longitude]
                  : null
              }
              greenBackLatLng={
                hole.green_back_latitude != null && hole.green_back_longitude != null
                  ? [hole.green_back_latitude, hole.green_back_longitude]
                  : null
              }
              centerLine={hole.center_line ?? null}
              holeNumber={hole.hole_number}
              par={hole.par}
              teeColor={hole.source_tee_color || hole.tee_color || roundTeeColor}
            />
          </div>
        )}
        {activeView !== "map" && currentImageUrl && (
          <Image
            key={`${hole.hole_number}-${activeView}`}
            src={currentImageUrl}
            alt={`Hole ${hole.hole_number} ${activeView} view`}
            fill
            className="object-contain"
            priority
            sizes="(max-width: 768px) 100vw, 512px"
            unoptimized
          />
        )}
        {!hasMap && !currentImageUrl && (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
            <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1}
                d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">No imagery for this hole</p>
          </div>
        )}

        {/* View toggle — overlays bottom-center */}
        {availableViews.length > 1 && (
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-[6]">
            <div className="flex bg-black/55 backdrop-blur-sm rounded-lg p-0.5 shadow-lg">
              {availableViews.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setImageView(v.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                    activeView === v.key
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-white/80 active:bg-white/10"
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
