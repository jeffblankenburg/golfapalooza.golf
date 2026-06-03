"use client";

import { useMemo, useState } from "react";
import type { Poll, PollResponse, PollResults } from "@/types/golf";

interface PollFormProps {
  poll: Poll;
  initialResponse: PollResponse | null;
  // Live aggregate results to show inline after the user has voted, when
  // poll.show_results_while_open is true. Null otherwise.
  liveResults?: PollResults | null;
  onSubmitted: () => void;
}

type AnswerState =
  | { type: "single"; option_id: string | null }
  | { type: "multi"; option_ids: Set<string> }
  | { type: "text"; text: string };

function buildInitialAnswers(poll: Poll, response: PollResponse | null): Map<string, AnswerState> {
  const map = new Map<string, AnswerState>();
  for (const q of poll.questions) {
    if (q.question_type === "single") {
      map.set(q.id, { type: "single", option_id: null });
    } else if (q.question_type === "multi") {
      map.set(q.id, { type: "multi", option_ids: new Set() });
    } else {
      map.set(q.id, { type: "text", text: "" });
    }
  }
  if (response) {
    for (const a of response.answers) {
      const state = map.get(a.question_id);
      if (!state) continue;
      if (state.type === "single" && a.option_id) {
        map.set(a.question_id, { type: "single", option_id: a.option_id });
      } else if (state.type === "multi" && a.option_id) {
        const next = new Set(state.option_ids);
        next.add(a.option_id);
        map.set(a.question_id, { type: "multi", option_ids: next });
      } else if (state.type === "text" && a.text_answer != null) {
        map.set(a.question_id, { type: "text", text: a.text_answer });
      }
    }
  }
  return map;
}

export function PollForm({
  poll,
  initialResponse,
  liveResults = null,
  onSubmitted,
}: PollFormProps) {
  const [answers, setAnswers] = useState<Map<string, AnswerState>>(() =>
    buildInitialAnswers(poll, initialResponse)
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasExistingVote = !!initialResponse;

  const setAnswer = (questionId: string, state: AnswerState) => {
    setAnswers((prev) => {
      const next = new Map(prev);
      next.set(questionId, state);
      return next;
    });
  };

  const validate = (): string | null => {
    for (const q of poll.questions) {
      const a = answers.get(q.id);
      if (!a) continue;
      if (q.question_type === "single") {
        if (!(a.type === "single" && a.option_id)) {
          return `Pick an answer for "${q.question_text}"`;
        }
      } else if (q.question_type === "multi") {
        if (!(a.type === "multi" && a.option_ids.size > 0)) {
          return `Pick at least one answer for "${q.question_text}"`;
        }
        if (q.max_selections != null && a.option_ids.size > q.max_selections) {
          return `Pick at most ${q.max_selections} for "${q.question_text}"`;
        }
      } else {
        if (!(a.type === "text" && a.text.trim())) {
          return `Answer "${q.question_text}"`;
        }
        const max = q.max_length ?? 500;
        if (a.text.length > max) {
          return `"${q.question_text}" answer is too long (${max} chars max)`;
        }
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    setSubmitting(true);

    const payload: { question_id: string; option_id?: string; text_answer?: string }[] = [];
    for (const q of poll.questions) {
      const a = answers.get(q.id);
      if (!a) continue;
      if (a.type === "single" && a.option_id) {
        payload.push({ question_id: q.id, option_id: a.option_id });
      } else if (a.type === "multi") {
        for (const oid of a.option_ids) {
          payload.push({ question_id: q.id, option_id: oid });
        }
      } else if (a.type === "text") {
        payload.push({ question_id: q.id, text_answer: a.text.trim() });
      }
    }

    try {
      const res = await fetch(`/api/polls/${poll.id}/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: payload }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  const handleWithdraw = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/polls/${poll.id}/respond`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to withdraw");
        setSubmitting(false);
        return;
      }
      onSubmitted();
    } catch {
      setError("Network error");
      setSubmitting(false);
    }
  };

  const charCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const [qid, a] of answers) {
      if (a.type === "text") m.set(qid, a.text.length);
    }
    return m;
  }, [answers]);

  // Live percentages baked into each option row. Server only returns
  // `liveResults` when poll.show_results_while_open AND the user has voted,
  // so we don't need to re-check those conditions here.
  const showLiveResults =
    poll.status === "active" && poll.show_results_while_open && !!liveResults;

  const pctByOption = useMemo(() => {
    const m = new Map<string, number>(); // option_id -> percentage (0-100)
    const textCounts = new Map<string, number>(); // question_id -> response count
    if (!liveResults) return { options: m, textCounts };
    for (const q of liveResults.questions) {
      if (q.options) {
        const total = q.options.reduce((s, o) => s + o.count, 0);
        for (const o of q.options) {
          m.set(o.option_id, total > 0 ? (o.count / total) * 100 : 0);
        }
      }
      if (q.text_answers) {
        textCounts.set(q.question_id, q.text_answers.length);
      }
    }
    return { options: m, textCounts };
  }, [liveResults]);

  return (
    <div className="px-4 py-4 space-y-4">
      {poll.description && (
        <p className="text-sm text-gray-600">{poll.description}</p>
      )}
      {poll.is_anonymous && (
        <p className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
          This poll is anonymous — your name is not attached to your answers.
        </p>
      )}

      {poll.questions.map((q) => {
        const a = answers.get(q.id);
        return (
          <div key={q.id} className="space-y-2">
            <p className="text-sm font-semibold text-gray-900">
              {q.question_text}
              {q.question_type === "multi" && q.max_selections != null && (
                <span className="ml-1 text-xs font-normal text-gray-500">
                  (pick up to {q.max_selections})
                </span>
              )}
            </p>

            {q.question_type === "single" && a?.type === "single" && (
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const checked = a.option_id === o.id;
                  const pct = showLiveResults
                    ? pctByOption.options.get(o.id) ?? 0
                    : null;
                  return (
                    <button
                      key={o.id}
                      onClick={() =>
                        setAnswer(q.id, { type: "single", option_id: o.id })
                      }
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors overflow-hidden ${
                        checked
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      {pct !== null && (
                        <div
                          className={`absolute inset-y-0 left-0 ${
                            checked ? "bg-green-200/70" : "bg-gray-100"
                          }`}
                          style={{ width: `${pct}%` }}
                          aria-hidden
                        />
                      )}
                      <div
                        className={`relative w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          checked ? "border-green-600" : "border-gray-300"
                        }`}
                      >
                        {checked && (
                          <div className="w-2.5 h-2.5 rounded-full bg-green-600" />
                        )}
                      </div>
                      <span className="relative text-sm text-gray-800 flex-1">
                        {o.option_text}
                      </span>
                      {pct !== null && (
                        <span className="relative text-xs font-semibold text-gray-700 tabular-nums">
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {q.question_type === "multi" && a?.type === "multi" && (
              <div className="space-y-1.5">
                {q.options.map((o) => {
                  const checked = a.option_ids.has(o.id);
                  const pct = showLiveResults
                    ? pctByOption.options.get(o.id) ?? 0
                    : null;
                  return (
                    <button
                      key={o.id}
                      onClick={() => {
                        const next = new Set(a.option_ids);
                        if (next.has(o.id)) next.delete(o.id);
                        else next.add(o.id);
                        setAnswer(q.id, { type: "multi", option_ids: next });
                      }}
                      className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border text-left transition-colors overflow-hidden ${
                        checked
                          ? "border-green-600 bg-green-50"
                          : "border-gray-200 bg-white"
                      }`}
                    >
                      {pct !== null && (
                        <div
                          className={`absolute inset-y-0 left-0 ${
                            checked ? "bg-green-200/70" : "bg-gray-100"
                          }`}
                          style={{ width: `${pct}%` }}
                          aria-hidden
                        />
                      )}
                      <div
                        className={`relative w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 ${
                          checked
                            ? "bg-green-600 border-green-600"
                            : "border-gray-300"
                        }`}
                      >
                        {checked && (
                          <svg
                            className="w-3.5 h-3.5 text-white"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={3}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </div>
                      <span className="relative text-sm text-gray-800 flex-1">
                        {o.option_text}
                      </span>
                      {pct !== null && (
                        <span className="relative text-xs font-semibold text-gray-700 tabular-nums">
                          {pct.toFixed(0)}%
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {q.question_type === "text" && a?.type === "text" && (
              <div>
                <textarea
                  rows={3}
                  value={a.text}
                  maxLength={q.max_length ?? 500}
                  onChange={(e) =>
                    setAnswer(q.id, { type: "text", text: e.target.value })
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] resize-none"
                  placeholder="Type your answer..."
                />
                <div className="flex items-center justify-between">
                  {showLiveResults ? (
                    <p className="text-[11px] text-gray-500 italic">
                      {pctByOption.textCounts.get(q.id) ?? 0}{" "}
                      {(pctByOption.textCounts.get(q.id) ?? 0) === 1
                        ? "response"
                        : "responses"}{" "}
                      so far
                    </p>
                  ) : (
                    <span />
                  )}
                  <p className="text-[11px] text-gray-400 text-right">
                    {charCounts.get(q.id) || 0} / {q.max_length ?? 500}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="flex-1 bg-green-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 active:bg-green-700"
        >
          {submitting
            ? "Saving..."
            : hasExistingVote
              ? "Update my vote"
              : "Submit"}
        </button>
        {hasExistingVote && (
          <button
            onClick={handleWithdraw}
            disabled={submitting}
            className="px-4 py-3 border border-gray-300 rounded-xl text-sm font-semibold text-gray-600 disabled:opacity-50"
          >
            Withdraw
          </button>
        )}
      </div>

      {hasExistingVote && (
        <p className="text-[11px] text-gray-400 text-center">
          You can change your vote until the poll closes.
        </p>
      )}
    </div>
  );
}
