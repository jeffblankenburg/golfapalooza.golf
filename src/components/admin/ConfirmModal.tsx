"use client";

import type { ReactNode } from "react";

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string | null;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  if (!open) return null;

  return (
    <div className="fixed top-14 bottom-16 left-0 right-0 z-35 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
        </div>
        <div className="px-6 py-4 text-sm text-gray-600">
          {typeof message === "string" ? <p>{message}</p> : message}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={onConfirm}
            className={`flex-1 py-3 rounded-xl font-semibold text-[15px] active:opacity-80 ${
              destructive
                ? "bg-red-600 text-white"
                : "bg-green-600 text-white"
            }`}
          >
            {confirmLabel}
          </button>
          {cancelLabel !== null && (
            <button
              onClick={onCancel}
              className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
            >
              {cancelLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
