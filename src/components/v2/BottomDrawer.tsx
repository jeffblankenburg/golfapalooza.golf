"use client";

import { useEffect } from "react";

interface BottomDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function BottomDrawer({ open, onClose, title, subtitle, children }: BottomDrawerProps) {
  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed top-14 bottom-0 left-0 right-0 z-35 flex items-end justify-center"
    >
      {/* Overlay — fills the constrained area */}
      <div className="absolute inset-0 bg-[#17211d]/20 backdrop-blur-[6px]" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[calc(100%-12px)] flex flex-col">
        {/* Compact header — matches the top-bar drawers (small title + X close). */}
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          {title ? (
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-gray-900 truncate">{title}</h2>
              {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
            </div>
          ) : (
            <div className="flex-1" />
          )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-gray-500 active:bg-gray-100"
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content — pb-20 keeps content above the bottom nav */}
        <div className="overflow-y-auto flex-1 pb-20">
          {children}
        </div>
      </div>
    </div>
  );
}
