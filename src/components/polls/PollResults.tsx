"use client";

import type { PollResults } from "@/types/golf";

interface PollResultsViewProps {
  results: PollResults;
  isAnonymous: boolean;
  // "live" hides text-answer content (only the count is shown) and labels
  // the header "Live results". "final" renders the full closed-poll view.
  mode?: "live" | "final";
}

export function PollResultsView({
  results,
  isAnonymous,
  mode = "final",
}: PollResultsViewProps) {
  const isLive = mode === "live";

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {isLive && (
          <span className="font-semibold text-green-700">Live results · </span>
        )}
        {results.total_respondents}{" "}
        {results.total_respondents === 1 ? "vote" : "votes"}
        {isAnonymous && " · anonymous"}
      </p>

      {results.questions.map((q) => (
        <div key={q.question_id} className="space-y-2">
          <p className="text-sm font-semibold text-gray-900">{q.question_text}</p>

          {q.options && q.options.length > 0 && (
            <div className="space-y-1.5">
              {q.options.map((o) => {
                const total =
                  q.options!.reduce((s, oo) => s + oo.count, 0) || 0;
                const pct = total > 0 ? (o.count / total) * 100 : 0;
                return (
                  <div key={o.option_id}>
                    <div className="flex items-center justify-between text-xs text-gray-700 mb-0.5">
                      <span>{o.option_text}</span>
                      <span>
                        {o.count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {q.text_answers && (
            <div className="space-y-1.5">
              {q.text_answers.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No responses</p>
              ) : isLive ? (
                <p className="text-xs text-gray-500 italic">
                  {q.text_answers.length}{" "}
                  {q.text_answers.length === 1 ? "response" : "responses"} so
                  far — shown when the poll closes
                </p>
              ) : (
                q.text_answers.map((a, i) => (
                  <div
                    key={i}
                    className="bg-gray-50 rounded px-3 py-2 text-sm text-gray-800"
                  >
                    {a.text}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
