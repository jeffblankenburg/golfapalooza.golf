"use client";

import { useState, useEffect, useCallback } from "react";
import { BottomDrawer } from "../admin/BottomDrawer";
import { PollForm } from "./PollForm";
import type { Poll, PollResponse } from "@/types/golf";

export function PollHomeButton() {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [response, setResponse] = useState<PollResponse | null>(null);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/polls/active");
      if (!res.ok) {
        setPoll(null);
        return;
      }
      const data = await res.json();
      setPoll(data.poll);
      setResponse(data.response);
    } catch {
      setPoll(null);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!loaded || !poll) return null;

  const hasVoted = !!response;

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full bg-white border-2 border-green-500 rounded-2xl px-4 py-3 shadow-sm active:scale-[0.99] transition-transform text-left"
      >
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-green-100 text-green-700 flex-shrink-0">
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-[10px] font-bold text-green-700 uppercase tracking-wider">
                Poll{hasVoted ? " · voted" : ""}
              </p>
            </div>
            <p className="text-sm font-semibold text-gray-900 truncate">
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
