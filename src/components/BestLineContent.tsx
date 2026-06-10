"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface Submission {
  id: string;
  text: string;
  created_at: string;
  submitter_id: string;
  submitter?: { display_name: string; avatar_url: string | null } | null;
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function BestLineContent() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"mine" | "all">("mine");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Submission | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchSubmissions = async () => {
    try {
      const res = await fetch("/api/best-lines");
      if (!res.ok) {
        if (res.status === 404) {
          setError("No active trip");
        }
        return;
      }
      const data = await res.json();
      setSubmissions(data.submissions || []);
      setIsAdmin(data.isAdmin);
      setCurrentUserId(data.currentUserId || null);
    } catch {
      setError("Failed to load submissions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch("/api/best-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: trimmed }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to submit");
        return;
      }

      const { submission } = await res.json();
      setSubmissions((prev) => [submission, ...prev]);
      setText("");
      if (textareaRef.current) {
        textareaRef.current.style.height = "80px";
      }
    } catch {
      setError("Failed to submit");
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);

    // Optimistic remove
    setSubmissions((prev) => prev.filter((s) => s.id !== id));

    try {
      const res = await fetch(`/api/best-lines?id=${id}`, { method: "DELETE" });
      if (!res.ok) {
        fetchSubmissions(); // revert on failure
      }
    } catch {
      fetchSubmissions();
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // For admin: filter by tab. For non-admin: API already returns only own.
  const displaySubmissions = isAdmin && activeTab === "mine"
    ? submissions.filter((s) => s.submitter_id === currentUserId)
    : submissions;

  if (loading) {
    return (
      <div className="px-4 py-8 flex justify-center">
        <div className="w-6 h-6 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold">Best Line</h1>
          <PinnedNoteButton pinnedTo="best_line" />
        </div>
        <Link
          href="/"
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border border-gray-300 active:bg-gray-200 transition-colors"
        >
          Done
        </Link>
      </div>

      {/* Submit form */}
      <form onSubmit={handleSubmit} className="mb-6">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const el = e.target;
            el.style.height = "80px";
            el.style.height = Math.max(80, Math.min(el.scrollHeight, 200)) + "px";
          }}
          placeholder="What happened? Who said what?"
          autoFocus
          className="w-full border border-gray-300 rounded-xl px-4 py-3 text-[0.9375rem] resize-none focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          style={{ height: "80px" }}
        />
        {error && <p className="text-red-600 text-sm mt-1">{error}</p>}
        <button
          type="submit"
          disabled={!text.trim() || submitting}
          className="mt-2 w-full py-2.5 rounded-xl font-semibold text-white bg-amber-600 hover:bg-amber-700 active:bg-amber-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {submitting ? "Submitting..." : "Submit"}
        </button>
      </form>

      {/* Tabs (admin only) */}
      {isAdmin && (
        <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1">
          <button
            onClick={() => setActiveTab("mine")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "mine" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            My Submissions
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === "all" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
            }`}
          >
            All Submissions
          </button>
        </div>
      )}

      {/* Submissions list */}
      {submissions.length === 0 ? (
        <div className="text-center text-gray-400 py-8">
          <p className="text-lg">No submissions yet</p>
          <p className="text-sm mt-1">Be the first to capture a great moment!</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displaySubmissions.map((s) => {
            const isExpanded = expandedIds.has(s.id);
            const submitter = Array.isArray(s.submitter) ? s.submitter[0] : s.submitter;
            return (
              <div
                key={s.id}
                className="bg-white border border-gray-200 rounded-xl px-4 py-3"
              >
                {/* Header: submitter (admin "all" tab) + timestamp */}
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 min-w-0">
                    {isAdmin && activeTab === "all" && submitter && (
                      <span className="text-xs font-semibold text-amber-700 truncate">
                        {submitter.display_name}
                      </span>
                    )}
                    <span className="text-xs text-gray-400 shrink-0">
                      {timeAgo(s.created_at)}
                    </span>
                  </div>
                  <button
                    onClick={() => setDeleteTarget(s)}
                    className="text-gray-300 hover:text-red-500 active:text-red-600 transition-colors p-1 -mr-1"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>

                {/* Text content */}
                <p
                  className={`text-[0.9375rem] text-gray-800 whitespace-pre-wrap break-words ${
                    !isExpanded ? "line-clamp-4" : ""
                  }`}
                  onClick={() => toggleExpand(s.id)}
                >
                  {s.text}
                </p>
              </div>
            );
          })}
        </div>
      )}
      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed top-14 bottom-16 left-0 right-0 z-40 flex items-end justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-lg bg-white rounded-t-2xl px-4 pt-5 pb-4 animate-slide-up">
            <p className="text-center text-gray-900 font-semibold mb-1">Delete Submission?</p>
            <p className="text-center text-sm text-gray-500 mb-1">This can&apos;t be undone.</p>
            <div className="bg-gray-100 rounded-xl px-3 py-2 mb-4 max-h-24 overflow-y-auto">
              <p className="text-sm text-gray-600 line-clamp-3">{deleteTarget.text}</p>
            </div>
            <button
              onClick={confirmDelete}
              className="w-full py-3 rounded-xl font-semibold text-white bg-red-600 active:bg-red-700 mb-2"
            >
              Delete
            </button>
            <button
              onClick={() => setDeleteTarget(null)}
              className="w-full py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 active:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
