"use client";

import { useState, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkBreaks from "remark-breaks";
import rehypeRaw from "rehype-raw";
import Link from "next/link";
import { ArticleImagePicker, ArticleImageValue } from "./ArticleImagePicker";
import { ConfirmModal } from "./ConfirmModal";

interface Article {
  id: string;
  title: string;
  content: string;
  publish_at: string | null;
  created_at: string;
  updated_at: string;
  featured_image_url: string | null;
  featured_image_source: string | null;
  featured_image_focal_x: number | null;
  featured_image_focal_y: number | null;
  author: { id: string; display_name: string; avatar_url: string | null } | null;
  featured_image: { id: string; media_url: string; thumbnail_url: string | null } | null;
}

type EditorMode = "list" | "edit";

function statusLabel(article: Article): { text: string; color: string } {
  if (!article.publish_at) return { text: "Draft", color: "bg-gray-100 text-gray-600" };
  if (new Date(article.publish_at) > new Date()) return { text: "Scheduled", color: "bg-yellow-100 text-yellow-700" };
  return { text: "Published", color: "bg-green-100 text-green-700" };
}

export function ArticleManager({ tripId }: { tripId: string }) {
  const [articles, setArticles] = useState<Article[]>([]);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<EditorMode>("list");

  // Editor state
  const [editId, setEditId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [featuredImage, setFeaturedImage] = useState<ArticleImageValue | null>(null);
  const [publishAt, setPublishAt] = useState<string>("");
  const [showPreview, setShowPreview] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showMarkdownHelp, setShowMarkdownHelp] = useState(false);
  const [copiedSyntax, setCopiedSyntax] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null);
  const [page, setPage] = useState(0);

  const fetchArticles = useCallback(async () => {
    const [articlesRes, viewsRes] = await Promise.all([
      fetch(`/api/admin/articles?trip_id=${tripId}`),
      fetch(`/api/admin/articles/views?trip_id=${tripId}`),
    ]);
    const articlesData = await articlesRes.json();
    const viewsData = await viewsRes.json();
    setArticles(articlesData.articles || []);
    setViewCounts(viewsData.counts || {});
  }, [tripId]);

  useEffect(() => {
    setLoading(true);
    fetchArticles().finally(() => setLoading(false));
  }, [fetchArticles]);

  const resetEditor = () => {
    setEditId(null);
    setTitle("");
    setContent("");
    setFeaturedImage(null);
    setPublishAt("");
    setShowPreview(false);
    setMode("list");
  };

  const openNewArticle = () => {
    resetEditor();
    setMode("edit");
  };

  const openEditArticle = (article: Article) => {
    setEditId(article.id);
    setTitle(article.title);
    setContent(article.content);

    // Hydrate featured image state from article data
    const source = (article.featured_image_source || "gallery") as "gallery" | "upload" | "song_art";
    if (source === "gallery" && article.featured_image) {
      setFeaturedImage({
        source: "gallery",
        galleryItemId: article.featured_image.id,
        imageUrl: article.featured_image.media_url,
        thumbnailUrl: article.featured_image.thumbnail_url || undefined,
        focalX: article.featured_image_focal_x ?? 50,
        focalY: article.featured_image_focal_y ?? 50,
      });
    } else if (article.featured_image_url) {
      setFeaturedImage({
        source,
        imageUrl: article.featured_image_url,
        focalX: article.featured_image_focal_x ?? 50,
        focalY: article.featured_image_focal_y ?? 50,
      });
    } else {
      setFeaturedImage(null);
    }

    setPublishAt(article.publish_at ? new Date(article.publish_at).toISOString().slice(0, 16) : "");
    setShowPreview(false);
    setMode("edit");
  };

  const handleSave = async (publishMode: "draft" | "now" | "schedule") => {
    if (!title.trim()) return;
    setSaving(true);

    // Check if this is an already-published article being edited
    const existingArticle = editId ? articles.find((a) => a.id === editId) : null;
    const isAlreadyPublished = existingArticle?.publish_at && new Date(existingArticle.publish_at) <= new Date();

    const payload: Record<string, unknown> = {
      id: editId,
      trip_id: tripId,
      title: title.trim(),
      content,
      featured_image_id: featuredImage?.source === "gallery" ? featuredImage.galleryItemId : null,
      featured_image_url: featuredImage && featuredImage.source !== "gallery" ? featuredImage.imageUrl : null,
      featured_image_source: featuredImage?.source || null,
      featured_image_focal_x: featuredImage?.focalX ?? 50,
      featured_image_focal_y: featuredImage?.focalY ?? 50,
    };

    // Determine publish_at value
    if (publishMode === "draft") {
      payload.publish_at = null;
    } else if (publishAt) {
      // Explicit schedule date always wins (past dates for imports, future for scheduling)
      payload.publish_at = new Date(publishAt).toISOString();
    } else if (publishMode === "now" && !isAlreadyPublished) {
      // No schedule date, publishing now for the first time
      payload.publish_at = new Date().toISOString();
    }
    // If already published with no schedule date change, publish_at is omitted (keeps original)

    await fetch("/api/admin/articles", {
      method: editId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    setSaving(false);
    resetEditor();
    await fetchArticles();
  };

  const handleDelete = async (id: string) => {
    await fetch("/api/admin/articles", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    setDeleteConfirm(null);
    await fetchArticles();
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ── Editor View ──
  if (mode === "edit") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <button onClick={resetEditor} className="text-sm text-green-700 font-medium">
            &larr; Back to list
          </button>
          <span className="text-sm text-gray-400">
            {editId ? "Edit Article" : "New Article"}
          </span>
        </div>

        {/* Title */}
        <input
          type="text"
          placeholder="Article title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-xl text-lg font-semibold focus:ring-2 focus:ring-green-500 focus:outline-none"
        />

        {/* Featured Image */}
        <ArticleImagePicker
          tripId={tripId}
          value={featuredImage}
          onChange={setFeaturedImage}
        />

        {/* Content — Edit / Preview toggle */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
              Content
            </label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowMarkdownHelp(true)}
                className="text-xs font-medium text-gray-400"
              >
                Formatting
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className="text-xs font-medium text-green-700"
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </div>
          </div>
          {showPreview ? (
            <div className="prose prose-sm max-w-none p-3 border border-gray-200 rounded-xl min-h-[200px] text-gray-700">
              <ReactMarkdown
                remarkPlugins={[remarkBreaks]}
                rehypePlugins={[rehypeRaw]}
                components={{
                  a: ({ href, children }) => {
                    if (href?.startsWith("/")) {
                      return <Link href={href} className="text-green-700 underline font-medium">{children}</Link>;
                    }
                    return <a href={href} target="_blank" rel="noopener noreferrer" className="text-green-700 underline font-medium">{children}</a>;
                  },
                }}
              >
                {content || "*Nothing to preview*"}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write your article using markdown..."
              rows={10}
              className="w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none resize-y"
            />
          )}
        </div>

        {/* Schedule datetime */}
        <div>
          <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            Schedule (optional)
          </label>
          <input
            type="datetime-local"
            value={publishAt}
            onChange={(e) => setPublishAt(e.target.value)}
            className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-green-500 focus:outline-none"
          />
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-2">
          <button
            onClick={() => handleSave("now")}
            disabled={saving || !title.trim()}
            className="w-full py-2.5 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80 disabled:opacity-50"
          >
            {saving ? "Saving..." : editId && articles.find((a) => a.id === editId)?.publish_at && new Date(articles.find((a) => a.id === editId)!.publish_at!) <= new Date() ? "Save Changes" : "Publish Now"}
          </button>
          <div className="flex gap-2">
            {publishAt && (
              <button
                onClick={() => handleSave("schedule")}
                disabled={saving || !title.trim()}
                className="flex-1 py-2.5 border border-yellow-400 text-yellow-700 rounded-xl text-sm font-semibold active:bg-yellow-50 disabled:opacity-50"
              >
                Schedule
              </button>
            )}
            <button
              onClick={() => handleSave("draft")}
              disabled={saving || !title.trim()}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl text-sm font-semibold active:bg-gray-50 disabled:opacity-50"
            >
              Save as Draft
            </button>
          </div>
        </div>

        {/* Markdown Help Drawer */}
        {showMarkdownHelp && (
          <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-black/40" onClick={() => setShowMarkdownHelp(false)} />
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl max-h-[80vh] flex flex-col animate-slide-up">
              <div className="flex justify-center pt-3 pb-1">
                <div className="w-10 h-1 rounded-full bg-gray-300" />
              </div>
              <div className="flex items-center justify-between px-4 pb-2">
                <h2 className="text-lg font-semibold">Formatting Guide</h2>
                <button onClick={() => setShowMarkdownHelp(false)} className="w-8 h-8 flex items-center justify-center">
                  <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">
                {[
                  { label: "Bold", syntax: "**bold text**", result: "bold text" },
                  { label: "Italics", syntax: "*italic text*", result: "italic text" },
                  { label: "Underline", syntax: "<u>underlined text</u>", result: "underlined text" },
                  { label: "Link", syntax: "[link text](https://example.com)", result: "link text" },
                  { label: "Image", syntax: "![alt text](https://example.com/image.jpg)", result: null },
                  { label: "Linked Image", syntax: "[![alt](https://example.com/img.jpg)](https://example.com)", result: null },
                  { label: "Bulleted List", syntax: "- Item one\n- Item two\n- Item three", result: null },
                ].map((item) => (
                  <div key={item.label} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{item.label}</p>
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(item.syntax);
                          setCopiedSyntax(item.label);
                          setTimeout(() => setCopiedSyntax(null), 1500);
                        }}
                        className="text-xs font-medium text-green-700"
                      >
                        {copiedSyntax === item.label ? "Copied!" : "Copy"}
                      </button>
                    </div>
                    <pre className="bg-gray-50 rounded-lg px-3 py-2 text-sm text-gray-700 font-mono whitespace-pre-wrap">{item.syntax}</pre>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── List View ──
  const pageSize = 20;
  const totalPages = Math.ceil(articles.length / pageSize);
  const paginatedArticles = articles.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
          Articles ({articles.length})
        </h2>
        <button
          onClick={openNewArticle}
          className="px-3 py-1.5 bg-green-600 text-white rounded-xl text-sm font-semibold active:opacity-80"
        >
          New Article
        </button>
      </div>

      {articles.length === 0 ? (
        <p className="text-center text-sm text-gray-400 py-8">
          No articles yet. Create your first one!
        </p>
      ) : (
        <div className="space-y-2">
          {paginatedArticles.map((article) => {
            const status = statusLabel(article);
            return (
              <div
                key={article.id}
                className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden"
              >
                <div className="flex items-center gap-3 p-3">
                  {(article.featured_image || article.featured_image_url) && (
                    <img
                      src={article.featured_image?.thumbnail_url || article.featured_image?.media_url || article.featured_image_url || ""}
                      alt=""
                      className="w-14 h-14 rounded-lg object-cover flex-shrink-0"
                      style={{ objectPosition: `${article.featured_image_focal_x ?? 50}% ${article.featured_image_focal_y ?? 50}%` }}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-900 truncate">
                        {article.title}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0 ${status.color}`}>
                        {status.text}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                      <span>
                        {article.publish_at
                          ? new Date(article.publish_at) > new Date()
                            ? `Scheduled for ${new Date(article.publish_at).toLocaleDateString()}`
                            : `Published ${new Date(article.publish_at).toLocaleDateString()}`
                          : `Created ${new Date(article.created_at).toLocaleDateString()}`}
                      </span>
                      {viewCounts[article.id] > 0 && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-blue-600 font-medium">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          {viewCounts[article.id]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => openEditArticle(article)}
                      className="p-2 text-gray-400 hover:text-blue-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                      </svg>
                    </button>
                    <button
                      onClick={() => setDeleteConfirm({ id: article.id, title: article.title })}
                      className="p-2 text-gray-400 hover:text-red-500"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:bg-green-100"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg disabled:opacity-30 disabled:cursor-not-allowed active:bg-green-100"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}

      <ConfirmModal
        open={!!deleteConfirm}
        title="Delete Article"
        message={`Are you sure you want to delete "${deleteConfirm?.title || ""}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm.id)}
        onCancel={() => setDeleteConfirm(null)}
      />
    </div>
  );
}
