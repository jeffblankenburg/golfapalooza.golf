"use client";

import { useState, useEffect } from "react";
import { BottomDrawer } from "../admin/BottomDrawer";
import { PollResultsView } from "./PollResults";
import type { Poll, PollResults } from "@/types/golf";

interface ClosedPollSummary {
  id: string;
  title: string;
  description: string | null;
  is_anonymous: boolean;
  starts_at: string | null;
  ends_at: string | null;
}

export function PollHistoryList() {
  const [polls, setPolls] = useState<ClosedPollSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [openPoll, setOpenPoll] = useState<Poll | null>(null);
  const [openResults, setOpenResults] = useState<PollResults | null>(null);

  useEffect(() => {
    fetch("/api/polls/history")
      .then((r) => r.json())
      .then((data) => {
        if (data.polls) setPolls(data.polls);
      })
      .finally(() => setLoading(false));
  }, []);

  const open = async (id: string) => {
    const res = await fetch(`/api/polls/${id}`);
    if (res.ok) {
      const data = await res.json();
      setOpenPoll(data.poll);
      setOpenResults(data.results);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (polls.length === 0) {
    return (
      <div className="text-center text-sm text-gray-400 py-12">
        No past polls yet.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {polls.map((p) => (
        <button
          key={p.id}
          onClick={() => open(p.id)}
          className="w-full text-left bg-white border border-gray-200 rounded-2xl p-3 active:scale-[0.99] transition-transform shadow-sm"
        >
          <p className="text-sm font-semibold text-gray-900">{p.title}</p>
          {p.description && (
            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
              {p.description}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">
            Closed{" "}
            {p.ends_at &&
              new Date(p.ends_at).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            {p.is_anonymous && " · anonymous"}
          </p>
        </button>
      ))}

      <BottomDrawer
        open={!!openPoll}
        onClose={() => {
          setOpenPoll(null);
          setOpenResults(null);
        }}
        title={openPoll?.title || "Results"}
        subtitle={openPoll?.is_anonymous ? "Anonymous poll" : undefined}
      >
        {openPoll && openResults && (
          <div className="px-4 py-4">
            <PollResultsView
              results={openResults}
              isAnonymous={openPoll.is_anonymous}
            />
          </div>
        )}
      </BottomDrawer>
    </div>
  );
}
