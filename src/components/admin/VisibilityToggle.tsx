"use client";

import { useState } from "react";

/**
 * Pill toggle for the per-contest visibility flag (`contests.tee_sheet_published_at`).
 * Used in admin section headers so admins can show/hide pre-round info from players.
 * Calls `e.stopPropagation()` so it can sit inside a CollapsibleSection header without
 * also toggling the section open/closed.
 */
export function VisibilityToggle({
  contestId,
  publishedAt,
  onChanged,
}: {
  contestId: string;
  publishedAt: string | null;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const isPublished = !!publishedAt;

  const click = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (busy) return;
    setBusy(true);
    try {
      await fetch(`/api/admin/contests/${contestId}/publish-tee-sheet`, {
        method: isPublished ? "DELETE" : "POST",
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      onClick={click}
      onKeyDown={(e) => e.stopPropagation()}
      disabled={busy}
      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold transition-colors disabled:opacity-50 ${
        isPublished
          ? "bg-green-100 text-green-700 active:bg-green-200"
          : "bg-gray-100 text-gray-600 active:bg-gray-200"
      }`}
      title={isPublished ? "Tap to hide from players" : "Tap to share with players"}
    >
      {busy ? "…" : isPublished ? "Shared" : "Hidden"}
    </button>
  );
}
