"use client";

import { useEffect } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import { BTN_BACK } from "@/lib/ui/buttons";

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

export function ArticleDetail({ article }: { article: Article }) {
  const publishDate = article.publish_at || article.created_at;

  // Record view (fire-and-forget)
  useEffect(() => {
    fetch(`/api/articles/${article.id}/view`, { method: "POST" }).catch(() => {});
  }, [article.id]);

  return (
    <div className="pb-8">
      {/* Back link */}
      <div className="px-4 pt-4 pb-2">
        <Link href="/articles" className={BTN_BACK}>
          &larr; Articles
        </Link>
      </div>

      {/* Featured image */}
      {(article.featured_image || article.featured_image_url) && (
        <img
          src={article.featured_image?.media_url || article.featured_image_url || ""}
          alt=""
          className="w-full h-52 object-cover"
          style={{ objectPosition: `${article.featured_image_focal_x ?? 50}% ${article.featured_image_focal_y ?? 50}%` }}
        />
      )}

      <div className="px-4 pt-4 space-y-4">
        {/* Title */}
        <h1 className="text-2xl font-bold text-gray-900 leading-snug">
          {article.title}
        </h1>

        {/* Byline */}
        <div className="flex items-center gap-2">
          {article.author?.avatar_url ? (
            <img
              src={article.author.avatar_url}
              alt=""
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center">
              <span className="text-xs font-semibold text-gray-500">
                {article.author?.display_name?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
          )}
          <div>
            <p className="text-sm font-medium text-gray-900">
              {article.author?.display_name || "Unknown"}
            </p>
            <p className="text-xs text-gray-400">
              {new Date(publishDate).toLocaleDateString(undefined, {
                weekday: "long",
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="prose prose-sm max-w-none text-gray-700">
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
              // ![alt](url) — render <video> when the URL points at a
              // video file (admins insert article videos through the
              // same drawer / markdown syntax as images).
              img: ({ src, alt }) => {
                if (typeof src === "string" && /\.(mp4|webm|mov)(\?|#|$)/i.test(src)) {
                  return (
                    <video
                      src={src}
                      controls
                      playsInline
                      preload="metadata"
                      className="w-full rounded-lg"
                    />
                  );
                }
                // eslint-disable-next-line @next/next/no-img-element
                return <img src={src} alt={alt || ""} />;
              },
            }}
          >
            {article.content}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}
