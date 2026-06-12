"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Full-screen image viewer for chat (and anywhere else a tap-to-enlarge
 * affordance is wanted). Tap anywhere — image, background, or the corner
 * ✕ — to dismiss. Esc also closes.
 *
 * Renders through a portal to document.body because the chat drawer
 * uses translate-y (a CSS transform) for its slide animation, and CSS
 * `position: fixed` is constrained to the nearest transformed ancestor,
 * not the viewport. Without the portal the lightbox is clipped to the
 * drawer's bounds and other chat messages stack on top.
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

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex items-center justify-center animate-fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
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
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        className="max-w-[100vw] max-h-[100vh] object-contain"
      />
    </div>,
    document.body,
  );
}
