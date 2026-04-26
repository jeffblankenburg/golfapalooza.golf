"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { formatCourseName } from "@/lib/utils/course-display";

interface UnverifiedCourse {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  hole_count: number;
  source: "manual" | "gcapi" | "ai";
  created_at: string;
  tee_summary: { count: number; back_par: number | null; back_rating: number | null; back_slope: number | null } | null;
}

export default function UnverifiedCoursesQueue() {
  const [courses, setCourses] = useState<UnverifiedCourse[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<UnverifiedCourse | null>(null);

  async function load() {
    setError(null);
    const res = await fetch("/api/admin/courses/unverified");
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed to load");
      return;
    }
    setCourses(data.courses || []);
  }

  useEffect(() => { load(); }, []);

  async function verify(id: string) {
    setBusy(id);
    const res = await fetch(`/api/admin/courses/${id}/verify`, { method: "POST" });
    setBusy(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Verify failed");
      return;
    }
    setCourses((cs) => (cs || []).filter((c) => c.id !== id));
  }

  async function deleteCourse(id: string) {
    setBusy(id);
    const res = await fetch(`/api/admin/courses/${id}`, { method: "DELETE" });
    setBusy(null);
    setConfirmingDelete(null);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "Delete failed");
      return;
    }
    setCourses((cs) => (cs || []).filter((c) => c.id !== id));
  }

  if (courses === null) {
    return <div className="p-6 text-sm text-gray-500">Loading…</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Unverified courses</h1>
          <p className="text-sm text-gray-600">
            Courses imported via the lookup cascade. Spot-check each against its source, then verify or delete.
          </p>
        </div>
        <Link href="/admin/courses" className="text-sm text-green-700 font-medium">← All courses</Link>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-lg px-3 py-2">{error}</div>
      )}

      {courses.length === 0 ? (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-500">
          Inbox zero. Every course has been verified.
        </div>
      ) : (
        <div className="space-y-2">
          {courses.map((c) => (
            <div key={c.id} className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Link href={`/admin/courses?course=${c.id}`} className="text-sm font-semibold text-gray-900 hover:underline">
                      {formatCourseName(c)}
                    </Link>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold tracking-wider ${
                      c.source === "ai" ? "bg-purple-100 text-purple-700" :
                      c.source === "gcapi" ? "bg-blue-100 text-blue-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>{c.source}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {[c.city, c.state].filter(Boolean).join(", ") || "—"}
                    {c.tee_summary && (
                      <> · {c.tee_summary.count} tees · back: par {c.tee_summary.back_par ?? "?"} / rating {c.tee_summary.back_rating ?? "?"} / slope {c.tee_summary.back_slope ?? "?"}</>
                    )}
                  </div>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <button
                    onClick={() => verify(c.id)}
                    disabled={busy === c.id}
                    className="px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded disabled:opacity-50 active:bg-green-700"
                  >
                    Verify
                  </button>
                  <Link
                    href={`/admin/courses?course=${c.id}`}
                    className="px-3 py-1.5 border border-gray-300 text-gray-700 text-xs font-semibold rounded active:bg-gray-50"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => setConfirmingDelete(c)}
                    disabled={busy === c.id}
                    className="px-3 py-1.5 border border-red-300 text-red-700 text-xs font-semibold rounded disabled:opacity-50 active:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmModal
        open={!!confirmingDelete}
        title="Delete this course?"
        message={
          <>
            <p className="mb-2">
              <span className="font-semibold text-gray-900">{confirmingDelete && formatCourseName(confirmingDelete)}</span>
              {confirmingDelete?.city && ` (${confirmingDelete.city}, ${confirmingDelete.state})`}
            </p>
            <p>This will also delete all of its tees and holes. It will fail if any rounds reference this course.</p>
          </>
        }
        confirmLabel={busy === confirmingDelete?.id ? "Deleting…" : "Delete"}
        destructive
        onConfirm={() => confirmingDelete && deleteCourse(confirmingDelete.id)}
        onCancel={() => setConfirmingDelete(null)}
      />
    </div>
  );
}
