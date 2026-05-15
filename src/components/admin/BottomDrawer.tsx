"use client";

import { useEffect } from "react";
import { DragHandle } from "@/components/DragHandle";

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
    <div className="fixed top-14 bottom-0 left-0 right-0 z-35 flex items-end justify-center">
      {/* Overlay — fills the constrained area */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* Drawer panel */}
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-[calc(100%-12px)] flex flex-col">
        {/* Handle bar */}
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
          <DragHandle onClose={onClose} className="mb-4" />
          <div className="flex items-start justify-between">
            {title ? (
              <div className="min-w-0 flex-1">
                <h2 className="text-xl font-bold text-gray-900 truncate">{title}</h2>
                {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <button
              onClick={onClose}
              className="ml-3 px-4 py-1.5 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700 flex-shrink-0"
            >
              Done
            </button>
          </div>
        </div>

        {/* Scrollable content — pb-20 keeps content above the bottom nav */}
        <div className="overflow-y-auto flex-1 pb-20">
          {children}
        </div>
      </div>
    </div>
  );
}
