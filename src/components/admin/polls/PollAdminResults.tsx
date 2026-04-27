"use client";

import type { PollResults } from "@/types/golf";

interface PollAdminResultsProps {
  results: PollResults;
  isAnonymous: boolean;
}

export function PollAdminResults({ results, isAnonymous }: PollAdminResultsProps) {
  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-500">
        {results.total_respondents}{" "}
        {results.total_respondents === 1 ? "response" : "responses"}
        {isAnonymous && " · anonymous"}
      </p>

      {results.questions.map((q) => (
        <div
          key={q.question_id}
          className="border border-gray-200 rounded-lg p-3 space-y-2"
        >
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
              {q.text_answers.length === 0 && (
                <p className="text-xs text-gray-400 italic">No responses</p>
              )}
              {q.text_answers.map((a, i) => (
                <div
                  key={i}
                  className="bg-gray-50 rounded px-3 py-2 text-sm text-gray-800"
                >
                  {!isAnonymous && a.display_name && (
                    <div className="text-xs text-gray-500 mb-0.5">
                      {a.display_name}
                    </div>
                  )}
                  {a.text}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
