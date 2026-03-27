"use client";

import { useRef, useEffect } from "react";

interface BottomDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export function BottomDrawer({ open, onClose, title, subtitle, children }: BottomDrawerProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

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

  return (
    <div
      ref={backdropRef}
      onClick={(e) => {
        if (e.target === backdropRef.current) onClose();
      }}
      className={`fixed inset-0 bg-black/40 z-50 transition-opacity duration-200 ${
        open ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      {/* Drawer panel — sits above the bottom nav (h-16 = 4rem) */}
      <div
        className={`absolute left-0 right-0 bottom-16 pb-safe bg-white rounded-t-2xl shadow-2xl transition-transform duration-200 ease-out flex flex-col overflow-hidden ${
          open ? "translate-y-0" : "translate-y-[calc(100%+4rem)]"
        }`}
        style={{ maxHeight: "calc(100vh - 4rem - env(safe-area-inset-top, 0px))" }}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="px-4 pb-3 pt-1 flex items-start justify-between flex-shrink-0">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 truncate">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="ml-3 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700 flex-shrink-0"
          >
            Done
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto border-t border-gray-100 min-h-0 flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}
