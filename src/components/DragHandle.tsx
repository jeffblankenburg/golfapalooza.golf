"use client";

interface DragHandleProps {
  onClose: () => void;
  className?: string;
}

// Tappable replacement for the decorative drag-handle pill at the top of
// bottom-sheet modals across the app. The visual bar (40×4 gray pill) is
// unchanged, but the surrounding button stretches to a full-width, ~24px-tall
// hit target so a one-handed tap reliably closes the sheet.
export function DragHandle({ onClose, className = "mb-4" }: DragHandleProps) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className={`block w-full py-2 ${className}`}
    >
      <span className="block w-10 h-1 bg-gray-300 rounded-full mx-auto" />
    </button>
  );
}
