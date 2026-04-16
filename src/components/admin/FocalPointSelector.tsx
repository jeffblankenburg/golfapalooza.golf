"use client";

import { useState, useRef, useCallback, useEffect } from "react";

const CROP_ASPECT = 2.2; // width:height ratio matching article card display

interface FocalPointSelectorProps {
  imageUrl: string;
  focalX: number; // 0-100
  focalY: number; // 0-100
  onChange: (focalX: number, focalY: number) => void;
}

export function FocalPointSelector({ imageUrl, focalX, focalY, onChange }: FocalPointSelectorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ startY: number; startFocalY: number } | null>(null);

  // Load natural image dimensions
  const handleImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImgSize({ w: img.naturalWidth, h: img.naturalHeight });
  }, []);

  // Calculate crop window position relative to the displayed image
  const getLayout = useCallback(() => {
    if (!containerRef.current || !imgSize) return null;

    const containerW = containerRef.current.clientWidth;
    // Image is displayed at full container width, maintaining aspect ratio
    const displayedH = containerW / (imgSize.w / imgSize.h);
    const cropH = containerW / CROP_ASPECT;

    // If image is shorter than crop window, no vertical adjustment needed
    if (displayedH <= cropH) {
      return { displayedH, cropH: displayedH, cropTop: 0, canDrag: false };
    }

    // Convert focal Y percentage to crop window top position
    const maxOffset = displayedH - cropH;
    const cropTop = (focalY / 100) * maxOffset;

    return { displayedH, cropH, cropTop, canDrag: true };
  }, [imgSize, focalY]);

  const layout = getLayout();

  const updateFocalFromY = useCallback((clientY: number) => {
    if (!containerRef.current || !imgSize) return;
    const rect = containerRef.current.getBoundingClientRect();
    const containerW = rect.width;
    const displayedH = containerW / (imgSize.w / imgSize.h);
    const cropH = containerW / CROP_ASPECT;

    if (displayedH <= cropH) return;

    const maxOffset = displayedH - cropH;
    const startData = dragStartRef.current;
    if (!startData) return;

    const deltaY = clientY - startData.startY;
    // Moving finger down = moving crop window down = increasing focalY
    const deltaPercent = (deltaY / maxOffset) * 100;
    const newFocalY = Math.max(0, Math.min(100, startData.startFocalY + deltaPercent));
    onChange(focalX, Math.round(newFocalY));
  }, [imgSize, focalX, onChange]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    dragStartRef.current = { startY: e.clientY, startFocalY: focalY };
  }, [focalY]);

  useEffect(() => {
    if (!dragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      updateFocalFromY(e.clientY);
    };
    const handleMouseUp = () => setDragging(false);

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [dragging, updateFocalFromY]);

  // Touch handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setDragging(true);
    dragStartRef.current = { startY: e.touches[0].clientY, startFocalY: focalY };
  }, [focalY]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault();
    updateFocalFromY(e.touches[0].clientY);
  }, [updateFocalFromY]);

  const handleTouchEnd = useCallback(() => {
    setDragging(false);
  }, []);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">Drag to adjust visible area</p>
        <button
          type="button"
          onClick={() => onChange(50, 50)}
          className="text-xs text-green-700 font-medium"
        >
          Reset
        </button>
      </div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-gray-200 select-none"
        style={{ touchAction: "none" }}
        onMouseDown={layout?.canDrag ? handleMouseDown : undefined}
        onTouchStart={layout?.canDrag ? handleTouchStart : undefined}
        onTouchMove={layout?.canDrag ? handleTouchMove : undefined}
        onTouchEnd={layout?.canDrag ? handleTouchEnd : undefined}
      >
        {/* Full image */}
        <img
          src={imageUrl}
          alt=""
          className="w-full block"
          onLoad={handleImageLoad}
          draggable={false}
        />

        {/* Dark overlay above crop window */}
        {layout && layout.canDrag && (
          <>
            <div
              className="absolute left-0 right-0 top-0 bg-black/50 pointer-events-none"
              style={{ height: layout.cropTop }}
            />
            {/* Crop window border */}
            <div
              className="absolute left-0 right-0 pointer-events-none"
              style={{
                top: layout.cropTop,
                height: layout.cropH,
                border: "2px dashed rgba(255,255,255,0.8)",
                boxShadow: "0 0 0 1px rgba(0,0,0,0.3)",
              }}
            >
              {/* Drag handle */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center">
                <div className="flex gap-1 bg-white/80 rounded-full px-3 py-1 shadow">
                  <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </div>
              </div>
            </div>
            {/* Dark overlay below crop window */}
            <div
              className="absolute left-0 right-0 bottom-0 bg-black/50 pointer-events-none"
              style={{ top: layout.cropTop + layout.cropH }}
            />
          </>
        )}

        {/* If image fits entirely, show a subtle border */}
        {layout && !layout.canDrag && (
          <div className="absolute inset-0 border-2 border-dashed border-green-400/50 rounded-xl pointer-events-none" />
        )}
      </div>
      {layout && !layout.canDrag && (
        <p className="text-xs text-gray-400 text-center">Image fits within the display area</p>
      )}
    </div>
  );
}
