"use client";

import { useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";

interface Note {
  id: string;
  title: string;
  content: string;
  sort_order: number;
  pinned_to: string | null;
}

interface Category {
  id: string;
  name: string;
  sort_order: number;
  notes: Note[];
}

function MarkdownBody({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkBreaks]}
      rehypePlugins={[rehypeRaw]}
      components={{
        a: ({ href, children }) => {
          if (href?.startsWith("/")) {
            return (
              <Link href={href} className="text-green-700 underline font-medium">
                {children}
              </Link>
            );
          }
          return (
            <a
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-green-700 underline font-medium"
            >
              {children}
            </a>
          );
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

export function NotebookContent({ categories, headerAction }: { categories: Category[]; headerAction?: React.ReactNode }) {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    categories[0]?.id || ""
  );
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);

  if (categories.length === 0) {
    return (
      <div className="px-4 pt-6 pb-8">
        <div className="flex items-center gap-2 mb-4">
          <h1 className="text-2xl font-bold text-gray-900">Notebook</h1>
          {headerAction}
        </div>
        <p className="text-gray-500 text-center py-8">No notes yet.</p>
      </div>
    );
  }

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const notes = selectedCategory?.notes || [];

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Notebook</h1>
        {headerAction}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 scrollbar-hide">
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => {
              setSelectedCategoryId(cat.id);
              setExpandedNoteId(null);
            }}
            className={`flex-shrink-0 px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              selectedCategoryId === cat.id
                ? "bg-emerald-600 text-white"
                : "bg-gray-100 text-gray-600 active:bg-gray-200"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Notes */}
      {notes.length === 0 ? (
        <p className="text-gray-500 text-center py-8">No notes in this category.</p>
      ) : (
        <div className="space-y-2">
          {notes.map((note) => {
            const isExpanded = expandedNoteId === note.id;

            return (
              <div
                key={note.id}
                className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <button
                  onClick={() => setExpandedNoteId(isExpanded ? null : note.id)}
                  className="w-full px-4 py-3.5 flex items-center justify-between text-left active:bg-gray-50 transition-colors"
                >
                  <span className="text-sm font-semibold text-gray-900">{note.title}</span>
                  <svg
                    className={`w-4 h-4 text-gray-400 transition-transform flex-shrink-0 ml-2 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 9l-7 7-7-7"
                    />
                  </svg>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-4 border-t border-gray-100 pt-3">
                    <div className="prose prose-sm max-w-none text-gray-700">
                      <MarkdownBody content={note.content} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
