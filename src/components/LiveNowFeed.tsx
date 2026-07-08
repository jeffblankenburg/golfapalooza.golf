"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface LivePlayer {
  id: string;
  display_name: string;
  avatar_url: string | null;
  is_guest: boolean;
}

interface LiveRound {
  round_id: string;
  round_type: string;
  created_at: string;
  created_by: string | null;
  creator_name: string | null;
  course_name: string;
  thru: number;
  players: LivePlayer[];
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

function startedAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

/**
 * "Live Now" — every in-progress individual round, watchable by anyone
 * (issue #140). Polls every 30s so newly-started rounds surface without a
 * page reload. Renders nothing when no rounds are live.
 */
export function LiveNowFeed() {
  const [rounds, setRounds] = useState<LiveRound[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch("/api/rounds/live")
        .then((res) => (res.ok ? res.json() : { rounds: [] }))
        .then((data) => {
          if (!cancelled) setRounds(data.rounds || []);
        })
        .catch(() => {
          if (!cancelled) setRounds([]);
        });
    load();
    const interval = setInterval(load, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  if (!rounds || rounds.length === 0) return null;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-2 px-1">
        <span className="inline-flex items-center gap-1.5 text-sm font-bold text-gray-900">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
          Live Now
        </span>
      </div>

      <div className="space-y-2">
        {rounds.map((r) => (
          <Link
            key={r.round_id}
            href={`/rounds/${r.round_id}/watch`}
            className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 shadow-sm px-3 py-2.5 active:scale-[0.99] transition-transform"
          >
            {/* Player avatars (up to 3) */}
            <div className="flex -space-x-2 flex-shrink-0">
              {r.players.slice(0, 3).map((p) => (
                <div
                  key={p.id}
                  className="w-8 h-8 rounded-full bg-green-700 text-white flex items-center justify-center overflow-hidden border-2 border-white"
                >
                  {p.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.avatar_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[0.625rem] font-bold">
                      {getInitials(p.display_name)}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-gray-900 truncate">
                {r.players.map((p) => p.display_name).join(", ") || "Round"}
              </div>
              <div className="text-xs text-gray-500 truncate">{r.course_name}</div>
              <div className="text-[0.6875rem] text-gray-400 truncate">
                Started {startedAgo(r.created_at)}
                {r.creator_name ? ` · by ${r.creator_name}` : ""}
              </div>
            </div>

            <div className="flex-shrink-0 text-right">
              <div className="text-xs font-medium text-gray-400">
                {r.thru > 0 ? `Thru ${r.thru}` : "Starting"}
              </div>
              <div className="text-[0.6875rem] font-semibold text-green-700">Watch →</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
