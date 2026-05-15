"use client";

import { useState, useCallback } from "react";
import { BottomDrawer } from "../admin/BottomDrawer";
import { PollForm } from "./PollForm";
import type { Poll, PollResponse } from "@/types/golf";

interface PollHomeButtonProps {
  initialPoll?: Poll | null;
  initialResponse?: PollResponse | null;
}

export function PollHomeButton({ initialPoll = null, initialResponse = null }: PollHomeButtonProps = {}) {
  // Seed from SSR so the button paints with the rest of the home page
  // instead of flashing in after a /api/polls/active round-trip.
  const [poll, setPoll] = useState<Poll | null>(initialPoll);
  const [response, setResponse] = useState<PollResponse | null>(initialResponse);
  const [open, setOpen] = useState(false);

  // After the user submits, refetch THIS poll's response so the "voted"
  // badge appears and the form prefills the next time the drawer opens.
  // We don't refetch the whole active-polls list — sibling banners on the
  // home page each manage their own state.
  const refresh = useCallback(async () => {
    if (!poll) return;
    try {
      const res = await fetch(`/api/polls/${poll.id}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.poll) setPoll(data.poll);
      setResponse(data.response ?? null);
    } catch {
      // Network blip — keep showing what we have.
    }
  }, [poll]);

  if (!poll) return null;

  const hasVoted = !!response;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`w-full bg-white border-2 border-fuchsia-500 rounded-2xl px-4 py-3 shadow-sm active:scale-[0.99] transition-transform text-left ${
          hasVoted ? "" : "animate-poll-pulse"
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-fuchsia-100 text-fuchsia-700 flex-shrink-0">
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M3 21h18M7 21V11M12 21V7M17 21V14"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-fuchsia-700 uppercase tracking-wider">
                Poll{hasVoted ? " · voted" : ""}
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900">
              {poll.title}
            </p>
          </div>
          <svg
            className="w-5 h-5 text-gray-400 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </div>
      </button>

      <BottomDrawer open={open} onClose={() => setOpen(false)}>
        <PollForm
          poll={poll}
          initialResponse={response}
          onSubmitted={() => {
            setOpen(false);
            refresh();
          }}
        />
      </BottomDrawer>
    </>
  );
}
