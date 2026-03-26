"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import { HoleData } from "@/lib/course-data";

type ImageView = "overhead" | "green";

interface Props {
  holes: HoleData[];
  initialHole: number;
  onClose: () => void;
}

export function HoleDetailModal({ holes, initialHole, onClose }: Props) {
  const [currentIndex, setCurrentIndex] = useState(initialHole - 1);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [imageView, setImageView] = useState<ImageView>("overhead");
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const isHorizontalSwipe = useRef<boolean | null>(null);

  const hole = holes[currentIndex];
  const SWIPE_THRESHOLD = 50;

  const currentImageUrl =
    imageView === "overhead" ? hole.overheadImageUrl : hole.greenImageUrl;

  const hasOverhead = !!hole.overheadImageUrl;
  const hasGreen = !!hole.greenImageUrl;
  const hasAnyImage = hasOverhead || hasGreen;

  const goToHole = useCallback(
    (index: number) => {
      if (index >= 0 && index < holes.length) {
        setIsAnimating(true);
        setCurrentIndex(index);
        setDragOffset(0);
        setTimeout(() => setIsAnimating(false), 300);
      }
    },
    [holes.length]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    isHorizontalSwipe.current = null;
    setIsAnimating(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaX = e.touches[0].clientX - touchStartX.current;
    const deltaY = e.touches[0].clientY - touchStartY.current;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(deltaX) > 10 || Math.abs(deltaY) > 10) {
        isHorizontalSwipe.current = Math.abs(deltaX) > Math.abs(deltaY);
      }
    }

    if (isHorizontalSwipe.current) {
      e.preventDefault();
      setDragOffset(deltaX);
    }
  };

  const handleTouchEnd = () => {
    if (Math.abs(dragOffset) > SWIPE_THRESHOLD) {
      if (dragOffset < 0 && currentIndex < holes.length - 1) {
        goToHole(currentIndex + 1);
      } else if (dragOffset > 0 && currentIndex > 0) {
        goToHole(currentIndex - 1);
      } else {
        setDragOffset(0);
      }
    } else {
      setDragOffset(0);
    }
    isHorizontalSwipe.current = null;
  };

  return (
    <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up flex flex-col max-h-full overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
          <h2 className="text-lg font-bold text-gray-900">
            Hole {hole.number}
          </h2>

          {/* View Toggle */}
          {hasAnyImage && (
            <div className="flex bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setImageView("overhead")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  imageView === "overhead"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Overhead
              </button>
              <button
                onClick={() => setImageView("green")}
                className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                  imageView === "green"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500"
                }`}
              >
                Green
              </button>
            </div>
          )}

          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors"
          >
            <svg
              className="w-6 h-6 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        {/* Swipeable Image Area */}
        <div
          className="flex-1 min-h-0 overflow-hidden bg-gray-100"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="w-full h-full relative"
            style={{
              transform: `translateX(${dragOffset}px)`,
              transition: isAnimating ? "transform 0.3s ease-out" : "none",
            }}
          >
            {currentImageUrl ? (
              <Image
                key={`${hole.number}-${imageView}`}
                src={currentImageUrl}
                alt={`Hole ${hole.number} ${imageView} view`}
                fill
                className="object-contain animate-fade-in"
                priority
                sizes="(max-width: 768px) 100vw, 512px"
                unoptimized
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                <svg
                  className="w-16 h-16 mb-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-sm">
                  No {imageView} image yet
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Stats Bar */}
        <div className="flex items-center justify-around px-4 py-3 bg-gray-50 border-t border-gray-100 shrink-0">
          <div className="flex flex-col items-center">
            <span className="text-xs text-gray-500">Par</span>
            <span className="text-lg font-bold text-gray-900">{hole.par}</span>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex flex-col items-center">
            <span className="text-xs text-gray-500">Hdcp</span>
            <span className="text-lg font-bold text-gray-900">
              {hole.handicap}
            </span>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div className="flex flex-col items-center">
            <span className="text-xs text-gray-500">Yards</span>
            <span className="text-lg font-bold text-gray-900">
              {hole.yards}
            </span>
          </div>
        </div>

        {/* Navigation Dots + Arrows */}
        <div className="flex items-center justify-center gap-1.5 px-4 py-3 pb-4 shrink-0">
          <button
            onClick={() => goToHole(currentIndex - 1)}
            disabled={currentIndex === 0}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors disabled:opacity-30"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 19l-7-7 7-7"
              />
            </svg>
          </button>

          {holes.map((_, i) => (
            <button
              key={i}
              onClick={() => goToHole(i)}
              className={`w-2 h-2 rounded-full transition-colors ${
                i === currentIndex ? "bg-green-600" : "bg-gray-300"
              }`}
            />
          ))}

          <button
            onClick={() => goToHole(currentIndex + 1)}
            disabled={currentIndex === holes.length - 1}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-gray-100 transition-colors disabled:opacity-30"
          >
            <svg
              className="w-5 h-5 text-gray-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
