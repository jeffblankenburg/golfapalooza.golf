"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { TransformWrapper, TransformComponent, useControls } from "react-zoom-pan-pinch";

/**
 * Full-screen image viewer with pinch-to-zoom (mobile), wheel zoom
 * (desktop), double-tap-to-toggle-zoom, and a download button.
 *
 * Renders through a portal to document.body because the chat drawer
 * uses translate-y (a CSS transform) for its slide animation, and CSS
 * `position: fixed` is constrained to the nearest transformed ancestor,
 * not the viewport.
 *
 * Tap outside the image to dismiss; tap the image itself to zoom
 * (double-tap toggle is wired through react-zoom-pan-pinch).
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  const handleDownload = async () => {
    if (downloading) return;
    setDownloading(true);
    try {
      const res = await fetch(src);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Derive a filename from the URL path; fall back to "image".
      const pathname = new URL(src, window.location.href).pathname;
      const base = pathname.split("/").pop() || "image";
      a.download = base.includes(".") ? base : `${base}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // Best-effort — if CORS or fetch fails, fall back to opening
      // the image in a new tab so the user can long-press save.
      window.open(src, "_blank");
    } finally {
      setDownloading(false);
    }
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-black/95 animate-fade-in"
      role="dialog"
      aria-modal="true"
    >
      <TransformWrapper
        initialScale={1}
        minScale={1}
        maxScale={6}
        doubleClick={{ mode: "toggle", step: 2 }}
        wheel={{ step: 0.2 }}
        pinch={{ step: 5 }}
        panning={{ velocityDisabled: false }}
        // When zoomed out, a tap on the backdrop closes; the wrapper
        // captures gestures only when needed.
      >
        <TransformComponent
          wrapperClass="!w-screen !h-screen"
          contentClass="!w-screen !h-screen flex items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt={alt}
            className="max-w-[100vw] max-h-[100vh] object-contain select-none"
            draggable={false}
          />
        </TransformComponent>

        <LightboxControls
          onClose={onClose}
          onDownload={handleDownload}
          downloading={downloading}
        />
      </TransformWrapper>
    </div>,
    document.body,
  );
}

/**
 * Lives inside <TransformWrapper> so `useControls()` (which reads context)
 * can drive a backdrop-tap-to-close that only fires when the user isn't
 * zoomed in — otherwise a tap to pan would dismiss the viewer.
 */
function LightboxControls({
  onClose,
  onDownload,
  downloading,
}: {
  onClose: () => void;
  onDownload: () => void;
  downloading: boolean;
}) {
  const { resetTransform } = useControls();

  return (
    <>
      {/* Close (top-right) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
        aria-label="Close image"
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:bg-white/25"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>

      {/* Download (top-left) */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onDownload();
        }}
        aria-label="Download image"
        disabled={downloading}
        className="absolute top-4 left-4 w-10 h-10 rounded-full bg-white/15 text-white flex items-center justify-center active:bg-white/25 disabled:opacity-50"
      >
        {downloading ? (
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3" />
          </svg>
        )}
      </button>

      {/* Reset (bottom-right) — only visible when zoomed; tapping resets
          to fit-to-screen. Helps users escape an accidental zoom. */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          resetTransform();
        }}
        aria-label="Reset zoom"
        className="absolute bottom-4 right-4 px-3 h-9 rounded-full bg-white/15 text-white text-xs font-medium flex items-center justify-center active:bg-white/25"
      >
        Reset
      </button>
    </>
  );
}
