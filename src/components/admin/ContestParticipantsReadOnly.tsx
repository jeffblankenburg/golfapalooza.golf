"use client";

import { useState } from "react";

interface Participant {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

/**
 * Read-only roster accordion for a daily contest. Unlike
 * ContestParticipantsAccordion (which edits the legacy umbrella
 * contest_participants), this just displays who's participating — the roster
 * is derived upstream from the per-day contests' option-driven opt-ins, which
 * are the single source of truth (issue #124). No add/remove here; enrollment
 * follows each Loozer's option selection.
 */
export function ContestParticipantsReadOnly({
  contestName,
  participants,
  total,
  showRealNames = false,
  defaultOpen = false,
}: {
  contestName: string;
  participants: Participant[];
  /** Total trip participants — shown as the denominator (e.g. 26 / 43). */
  total?: number;
  showRealNames?: boolean;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-gray-900">{contestName} Participants</span>
          <span className="text-xs text-gray-400">
            {participants.length}{total != null ? ` / ${total}` : ""}
          </span>
        </div>
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-gray-200 px-4 py-2">
          {participants.length === 0 ? (
            <p className="text-sm text-gray-400 py-3 text-center">No participants yet</p>
          ) : (
            participants.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 py-2">
                {p.avatar_url ? (
                  <img src={p.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.625rem] font-bold flex-shrink-0">
                    {(p.display_name || "?")[0].toUpperCase()}
                  </span>
                )}
                <span className="text-sm text-gray-900">
                  {showRealNames ? (p.full_name || p.display_name) : p.display_name}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
