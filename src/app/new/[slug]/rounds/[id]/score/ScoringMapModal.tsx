"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import Image from "next/image";
import { TEE_HEX_COLORS } from "@/lib/utils/tee-colors";

const HoleMapViewLazy = dynamic(() => import("@/components/my-rounds/HoleMapView"), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-gray-100 text-gray-400 text-sm">Loading map…</div>
  ),
});

export interface MapHole {
  hole_number: number;
  hole_name?: string | null;
  par: number;
  yards: number | null;
  tee_latitude?: number | null;
  tee_longitude?: number | null;
  green_latitude?: number | null;
  green_longitude?: number | null;
  green_front_latitude?: number | null;
  green_front_longitude?: number | null;
  green_back_latitude?: number | null;
  green_back_longitude?: number | null;
  drive_latitude?: number | null;
  drive_longitude?: number | null;
  center_line?: [number, number][] | null;
  overhead_image_url?: string | null;
  green_image_url?: string | null;
}

type ImageView = "map" | "overhead" | "green";

/** Whether any hole in the round has imagery worth a Map button. */
export function anyHoleMapped(holes: MapHole[]): boolean {
  return holes.some((h) => (h.tee_latitude != null && h.tee_longitude != null) || h.overhead_image_url || h.green_image_url);
}

/**
 * Full-screen map modal for the live scorer (#184). Portaled to <body> so it sits
 * above the scorer. Satellite map (per-hole tee/green/drive markers via HoleMapView)
 * plus Overhead / Green imagery toggles when present, and a per-hole empty state.
 * Ported from v1's ScoringMapDrawer, reshaped as a modal.
 */
export default function ScoringMapModal({
  holes,
  startIndex,
  roundTeeColor = null,
  onClose,
}: {
  holes: MapHole[];
  startIndex: number;
  roundTeeColor?: string | null;
  onClose: () => void;
}) {
  const [idx, setIdx] = useState(startIndex);
  const hole = holes[idx] ?? holes[0];

  // Remember the last view (Map / Overhead / Green) across opens.
  const [imageView, setImageView] = useState<ImageView>(() => {
    if (typeof sessionStorage === "undefined") return "map";
    const raw = sessionStorage.getItem("v2_scoring_image_view");
    return raw === "map" || raw === "overhead" || raw === "green" ? raw : "map";
  });
  useEffect(() => {
    try {
      sessionStorage.setItem("v2_scoring_image_view", imageView);
    } catch {
      /* ignore */
    }
  }, [imageView]);

  // Lock background scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
  const activeView: ImageView | null = availableViews.find((v) => v.key === imageView)?.key || availableViews[0]?.key || null;
  const currentImageUrl = activeView === "overhead" ? hole?.overhead_image_url : activeView === "green" ? hole?.green_image_url : null;

  if (!hole) return null;

  const dotHex = roundTeeColor ? TEE_HEX_COLORS[roundTeeColor] || null : null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl w-full max-w-lg h-[82vh] max-h-[720px] flex flex-col overflow-hidden shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
      {/* Hole nav header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100 shrink-0">
        <button
          type="button"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={idx === 0}
          aria-label="Previous hole"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>

        <div className="flex-1 min-w-0 flex items-center justify-center gap-2 text-sm text-gray-500">
          {dotHex && (
            <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: dotHex, border: dotHex === "#f3f4f6" ? "1px solid #9ca3af" : undefined }} />
          )}
          <span className="font-bold text-gray-900">Hole {hole.hole_number}</span>
          {hole.hole_name && <span className="text-gray-400 truncate">{hole.hole_name}</span>}
          <span className="w-px h-4 bg-gray-200 shrink-0" />
          <span className="shrink-0">Par <span className="font-bold text-gray-900">{hole.par}</span></span>
          {hole.yards != null && (
            <>
              <span className="w-px h-4 bg-gray-200 shrink-0" />
              <span className="shrink-0"><span className="font-bold text-gray-900">{hole.yards}</span> yds</span>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIdx((i) => Math.min(holes.length - 1, i + 1))}
          disabled={idx === holes.length - 1}
          aria-label="Next hole"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 active:bg-gray-200 disabled:opacity-30"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
        </button>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close map"
          className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full bg-gray-900 text-white active:bg-gray-800"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      {/* Imagery */}
      <div className="flex-1 min-h-0 relative bg-white">
        {hasMap && (
          <div className={`absolute inset-0 ${activeView === "map" ? "" : "opacity-0 pointer-events-none"}`}>
            <HoleMapViewLazy
              teeLatLng={[hole.tee_latitude!, hole.tee_longitude!]}
              greenLatLng={hole.green_latitude != null && hole.green_longitude != null ? [hole.green_latitude, hole.green_longitude] : null}
              driveLatLng={hole.drive_latitude != null && hole.drive_longitude != null ? [hole.drive_latitude, hole.drive_longitude] : null}
              greenFrontLatLng={hole.green_front_latitude != null && hole.green_front_longitude != null ? [hole.green_front_latitude, hole.green_front_longitude] : null}
              greenBackLatLng={hole.green_back_latitude != null && hole.green_back_longitude != null ? [hole.green_back_latitude, hole.green_back_longitude] : null}
              centerLine={hole.center_line ?? null}
              holeNumber={hole.hole_number}
              par={hole.par}
              teeColor={roundTeeColor}
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
            sizes="100vw"
            unoptimized
          />
        )}
        {!hasMap && !currentImageUrl && (
          <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 px-6 text-center">
            <svg className="w-16 h-16 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">This hole hasn&apos;t been mapped yet.</p>
          </div>
        )}

        {availableViews.length > 1 && (
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-[6]">
            <div className="flex bg-black/55 backdrop-blur-sm rounded-lg p-0.5 shadow-lg">
              {availableViews.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => setImageView(v.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${activeView === v.key ? "bg-white text-gray-900 shadow-sm" : "text-white/80 active:bg-white/10"}`}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      </div>
    </div>,
    document.body,
  );
}
