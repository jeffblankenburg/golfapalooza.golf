"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";

export function PinnedNoteButton({ pinnedTo, tripId }: { pinnedTo: string; tripId?: string }) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<{ title: string; content: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetched, setFetched] = useState(false);

  const handleOpen = async () => {
    setOpen(true);
    if (fetched) return;

    setLoading(true);
    const params = new URLSearchParams({ pinned_to: pinnedTo });
    if (tripId) params.set("trip_id", tripId);
    const res = await fetch(`/api/notebook?${params}`);
    if (res.ok) {
      const data = await res.json();
      setNote(data.note || null);
    }
    setLoading(false);
    setFetched(true);
  };

  return (
    <>
      <button
        onClick={handleOpen}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 active:bg-gray-200 transition-colors"
        aria-label="Info"
      >
        <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>

      {open && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={() => setOpen(false)}>
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">
                {loading ? "Loading..." : note?.title || "Info"}
              </h2>
              <button
                onClick={() => setOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-100"
              >
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {loading && (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
                </div>
              )}

              {!loading && !note && (
                <p className="text-gray-500 text-center py-8">No notes available for this section.</p>
              )}

              {!loading && note && (
                <div className="prose prose-sm max-w-none text-gray-700">
                  <ReactMarkdown
                    remarkPlugins={[remarkBreaks]}
                    rehypePlugins={[rehypeRaw]}
                    components={{
                      a: ({ href, children }) => {
                        if (href?.startsWith("/")) {
                          return (
                            <Link href={href} className="text-green-700 underline font-medium" onClick={() => setOpen(false)}>
                              {children}
                            </Link>
                          );
                        }
                        return (
                          <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-700 underline font-medium">
                            {children}
                          </a>
                        );
                      },
                    }}
                  >
                    {note.content}
                  </ReactMarkdown>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
