"use client";

import { useState } from "react";
import type { PollResults } from "@/types/golf";
import { exportPollResultsToExcel } from "@/lib/poll-export";

interface PollAdminResultsProps {
  results: PollResults;
  isAnonymous: boolean;
  pollTitle: string;
}

export function PollAdminResults({ results, isAnonymous, pollTitle }: PollAdminResultsProps) {
  const [exporting, setExporting] = useState(false);

  async function handleExport() {
    if (exporting) return;
    setExporting(true);
    try {
      await exportPollResultsToExcel({ pollTitle, results, isAnonymous });
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">
          {results.total_respondents}{" "}
          {results.total_respondents === 1 ? "response" : "responses"}
          {isAnonymous && " · anonymous"}
        </p>
        <button
          type="button"
          onClick={handleExport}
          disabled={exporting || results.total_respondents === 0}
          className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-md active:bg-green-100 disabled:opacity-50"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          {exporting ? "Exporting…" : "Excel"}
        </button>
      </div>

      {results.questions.map((q) => (
        <div
          key={q.question_id}
          className="border border-gray-200 rounded-lg p-3 space-y-2"
        >
          <p className="text-sm font-semibold text-gray-900">{q.question_text}</p>

          {q.options && q.options.length > 0 && (
            <div className="space-y-1.5">
              {[...q.options]
                .sort((a, b) => b.count - a.count)
                .map((o) => {
                const pct =
                  results.total_respondents > 0
                    ? (o.count / results.total_respondents) * 100
                    : 0;
                const voters = !isAnonymous ? o.voters || [] : [];
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
                    {voters.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {voters.map((v) => (
                          <span
                            key={v.user_id}
                            className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-gray-100 text-[11px] text-gray-700"
                          >
                            {v.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={v.avatar_url}
                                alt=""
                                className="w-4 h-4 rounded-full object-cover"
                              />
                            ) : (
                              <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-[9px] font-semibold text-gray-600">
                                {v.display_name?.[0]?.toUpperCase() || "?"}
                              </span>
                            )}
                            <span className="truncate max-w-[140px]">
                              {v.display_name}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}
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
