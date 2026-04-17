"use client";

import { useState } from "react";
import Link from "next/link";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { stripMarkdown } from "@/lib/strip-markdown";

const PAGE_SIZE = 20;

interface Article {
  id: string;
  title: string;
  content: string;
  publish_at: string | null;
  created_at: string;
  featured_image_url?: string | null;
  featured_image_focal_x?: number | null;
  featured_image_focal_y?: number | null;
  author: { id: string; display_name: string; avatar_url: string | null } | null;
  featured_image: { id: string; media_url: string; thumbnail_url: string | null } | null;
}

function timeAgo(date: string): string {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return "Just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}


export function ArticleList({ articles, headerAction }: { articles: Article[]; headerAction?: React.ReactNode }) {
  const [page, setPage] = useState(0);
  const totalPages = Math.ceil(articles.length / PAGE_SIZE);
  const paginated = articles.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Articles</h1>
        {headerAction}
        <PinnedNoteButton pinnedTo="articles" />
      </div>

      {articles.length === 0 ? (
        <div className="text-center py-12">
          <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
          </svg>
          <p className="text-gray-400 text-sm">No articles published yet.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {paginated.map((article) => (
            <Link
              key={article.id}
              href={`/articles/${article.id}`}
              className="block bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden active:bg-gray-50 transition-colors"
            >
              {(article.featured_image || article.featured_image_url) && (
                <img
                  src={article.featured_image?.thumbnail_url || article.featured_image?.media_url || article.featured_image_url || ""}
                  alt=""
                  className="w-full h-44 object-cover"
                  style={{ objectPosition: `${article.featured_image_focal_x ?? 50}% ${article.featured_image_focal_y ?? 50}%` }}
                />
              )}
              <div className="p-4">
                <h2 className="text-lg font-bold text-gray-900 leading-snug">
                  {article.title}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {stripMarkdown(article.content)}
                </p>
                <div className="flex items-center gap-2 mt-3">
                  {article.author?.avatar_url ? (
                    <img
                      src={article.author.avatar_url}
                      alt=""
                      className="w-5 h-5 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-gray-200" />
                  )}
                  <span className="text-xs text-gray-400">
                    {article.author?.display_name || "Unknown"}
                  </span>
                  <span className="text-xs text-gray-300">-</span>
                  <span className="text-xs text-gray-400">
                    {timeAgo(article.publish_at || article.created_at)}
                  </span>
                </div>
              </div>
            </Link>
          ))}

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => { setPage(page - 1); window.scrollTo(0, 0); }}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:bg-green-100"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => { setPage(page + 1); window.scrollTo(0, 0); }}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:bg-green-100"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
