"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { DragHandle } from "@/components/DragHandle";
import {
  LiveScoreboard,
  type ScoreboardHole,
  type ScoreboardPlayer,
  type ScoreboardRound,
} from "@/components/rounds/LiveScoreboard";

interface LivePlayer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_guest: boolean;
}

interface LiveRound {
  round_id: string;
  format: string;
  created_at: string;
  creator_name: string | null;
  course_id: string | null;
  course_name: string;
  thru: number;
  players: LivePlayer[];
}

interface Board {
  round: ScoreboardRound;
  holes: ScoreboardHole[];
  players: ScoreboardPlayer[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

/**
 * "Other groups" overlay for the individual live scorer. Surfaces every other
 * in-progress round on the SAME course (a small outing / concurrent group tee
 * times) and lets the scorer peek at each group's full card inline without
 * leaving their own scoring session. Renders nothing (not even the trigger)
 * when no other groups are out on this course.
 *
 * Course is derived from the live feed by `currentRoundId` so it works whether
 * the scorer was handed a courseId or not (resume flow omits it).
 */
export function OtherGroupsOverlay({
  currentRoundId,
  courseId = null,
}: {
  currentRoundId: string;
  courseId?: string | null;
}) {
  const [groups, setGroups] = useState<LiveRound[]>([]);
  const [open, setOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [boards, setBoards] = useState<Record<string, Board>>({});
  const [loadingBoard, setLoadingBoard] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/rounds/live");
      if (!res.ok) return;
      const data = await res.json();
      const all: LiveRound[] = data.rounds || [];
      // The current round's course: prefer the explicit prop, else find our own
      // entry in the feed.
      const myCourseId = courseId ?? all.find((r) => r.round_id === currentRoundId)?.course_id ?? null;
      if (!myCourseId) {
        setGroups([]);
        return;
      }
      setGroups(all.filter((r) => r.round_id !== currentRoundId && r.course_id === myCourseId));
    } catch {
      /* transient — keep the last good list */
    }
  }, [currentRoundId, courseId]);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30000);
    return () => clearInterval(interval);
  }, [load]);

  const toggleExpand = useCallback(
    async (roundId: string) => {
      if (expandedId === roundId) {
        setExpandedId(null);
        return;
      }
      setExpandedId(roundId);
      if (!boards[roundId]) {
        setLoadingBoard(true);
        try {
          const res = await fetch(`/api/rounds/${roundId}/scoreboard`);
          if (res.ok) {
            const board: Board = await res.json();
            setBoards((prev) => ({ ...prev, [roundId]: board }));
          }
        } finally {
          setLoadingBoard(false);
        }
      }
    },
    [expandedId, boards],
  );

  if (groups.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-2 py-0.5 active:bg-green-100"
        title="See other groups out on this course"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        Groups {groups.length}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="relative w-full max-w-2xl bg-white rounded-t-3xl p-4 pb-8 animate-slide-up max-h-[85vh] overflow-y-auto">
            <DragHandle onClose={() => setOpen(false)} className="mb-3" />
            <h2 className="text-lg font-bold text-gray-900 mb-1">Other groups on {groups[0]?.course_name}</h2>
            <p className="text-xs text-gray-500 mb-4">
              Everyone else scoring here right now. Tap a group to see its card.
            </p>

            <div className="space-y-2">
              {groups.map((g) => {
                const isExpanded = expandedId === g.round_id;
                const board = boards[g.round_id];
                return (
                  <div key={g.round_id} className="border border-gray-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => toggleExpand(g.round_id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 text-left active:bg-gray-50"
                    >
                      <div className="flex -space-x-2 flex-shrink-0">
                        {g.players.slice(0, 3).map((p) => (
                          <div
                            key={p.id}
                            className="w-7 h-7 rounded-full bg-green-700 text-white flex items-center justify-center overflow-hidden border-2 border-white"
                          >
                            {p.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-[0.5625rem] font-bold">{getInitials(p.display_name)}</span>
                            )}
                          </div>
                        ))}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-gray-900 truncate flex items-center gap-1.5">
                          <span className="truncate">{g.players.map((p) => p.display_name).join(", ") || "Round"}</span>
                          {g.format === "scramble" && (
                            <span className="flex-shrink-0 text-[0.5625rem] font-bold uppercase tracking-wide bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded-full">
                              Scramble
                            </span>
                          )}
                        </div>
                        <div className="text-[0.6875rem] text-gray-400">
                          {g.thru > 0 ? `Thru ${g.thru}` : "Starting"}
                        </div>
                      </div>
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="border-t border-gray-100 p-2 bg-gray-50/50">
                        {board ? (
                          <>
                            <LiveScoreboard round={board.round} holes={board.holes} players={board.players} />
                            <Link
                              href={`/rounds/${g.round_id}/watch`}
                              className="mt-2 inline-block text-xs font-semibold text-green-700"
                            >
                              Open full page →
                            </Link>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400 text-center py-4">
                            {loadingBoard ? "Loading card…" : "Couldn't load this card."}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
