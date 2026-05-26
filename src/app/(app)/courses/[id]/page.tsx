"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CourseManager } from "@/components/admin/CourseManager";
import { CourseHelpDrawer } from "@/components/courses/CourseHelpDrawer";
import { MappedStatusBadge } from "@/components/courses/MappedStatusBadge";
import { BTN_BACK } from "@/lib/ui/buttons";

interface CourseMeta {
  name: string;
  city: string | null;
  state: string | null;
  locked: boolean;
  updated_at: string | null;
  updated_by: string | null;
}

export default function CoursePage() {
  const params = useParams();
  const courseId = params.id as string;

  const [meta, setMeta] = useState<CourseMeta | null>(null);
  const [viewerIsAdmin, setViewerIsAdmin] = useState(false);
  const [editorByName, setEditorByName] = useState<string | null>(null);
  const [mapped, setMapped] = useState<{ setPoints: number; totalPoints: number; fullyMappedHoles: number; totalHoles: number } | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // The page-header summary is intentionally lightweight: name + lock/mapped
  // badges + attribution + help. The CourseManager below handles the heavy
  // detail rendering and edits via its own loadCourse() flow.
  const loadMeta = useCallback(async () => {
    const [courseRes, holesRes] = await Promise.all([
      fetch(`/api/courses/${courseId}`),
      fetch(`/api/courses/list`),
    ]);
    if (courseRes.ok) {
      const data = await courseRes.json();
      if (data.course) {
        setMeta({
          name: data.course.name,
          city: data.course.city,
          state: data.course.state,
          locked: !!data.course.locked,
          updated_at: data.course.updated_at,
          updated_by: data.course.updated_by,
        });
        setViewerIsAdmin(!!data.is_admin);

        // Fetch the editor's display name when we have a updated_by uuid.
        if (data.course.updated_by) {
          const userRes = await fetch(`/api/users/list`);
          if (userRes.ok) {
            const userData = await userRes.json();
            const match = (userData.users || []).find((u: { id: string }) => u.id === data.course.updated_by);
            if (match) setEditorByName(match.display_name);
          }
        }
      }
    }
    // Precomputed mapped-status totals from /api/courses/list — cheaper
    // than refetching every coord row on the detail page.
    if (holesRes.ok) {
      const data = await holesRes.json();
      const thisCourse = (data.courses || []).find((c: { id: string }) => c.id === courseId);
      if (thisCourse) {
        setMapped({
          setPoints: thisCourse.mapped.set_points,
          totalPoints: thisCourse.mapped.total_points,
          fullyMappedHoles: thisCourse.mapped.fully_mapped_holes,
          totalHoles: thisCourse.mapped.total_holes,
        });
      }
    }
  }, [courseId]);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  const subtitle = meta ? [meta.city, meta.state].filter(Boolean).join(", ") : "";

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <Link href="/courses" className={BTN_BACK}>← Courses</Link>

      {meta && (
        <div className="mt-3 mb-4 bg-white border border-gray-200 rounded-2xl shadow-sm p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-lg font-semibold text-gray-900 leading-snug">{meta.name}</h1>
              {subtitle && <div className="text-sm text-gray-500 mt-0.5">{subtitle}</div>}
              {meta.updated_at && (
                <div className="text-[11px] text-gray-400 mt-2">
                  Last edited{editorByName ? ` by ${editorByName}` : ""} on{" "}
                  {new Date(meta.updated_at).toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })}
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0">
              {meta.locked && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded-md">
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Locked
                </span>
              )}
              {mapped && (
                <MappedStatusBadge
                  fullyMappedHoles={mapped.fullyMappedHoles}
                  totalHoles={mapped.totalHoles}
                  variant="verbose"
                  setPoints={mapped.setPoints}
                  totalPoints={mapped.totalPoints}
                />
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setHelpOpen(true)}
            className="mt-3 text-xs text-green-700 font-semibold underline-offset-2 hover:underline"
          >
            How to edit this course
          </button>
        </div>
      )}

      {meta?.locked && !viewerIsAdmin && (
        <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-sm text-amber-800">
          This course is locked. Ask an admin if you spot something to fix.
        </div>
      )}

      <CourseManager courseId={courseId} mode="loozer" viewerIsAdmin={viewerIsAdmin} />

      <CourseHelpDrawer open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  );
}
