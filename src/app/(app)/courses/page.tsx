"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CourseLookupModal from "@/components/my-rounds/CourseLookupModal";
import { MappedStatusBadge } from "@/components/courses/MappedStatusBadge";

interface CourseRow {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  locked: boolean;
  updated_at: string | null;
  last_played_at: string | null;
  mapped: {
    set_points: number;
    total_points: number;
    fully_mapped_holes: number;
    total_holes: number;
  };
}

interface CoursesResponse {
  active_event_course_id: string | null;
  courses: CourseRow[];
}

function CourseCard({ course, featured = false }: { course: CourseRow; featured?: boolean }) {
  const subtitle = [course.city, course.state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/courses/${course.id}`}
      className={
        featured
          ? "block rounded-2xl border border-green-200 bg-green-50/40 p-4 shadow-sm active:bg-green-50"
          : "block rounded-xl border border-gray-200 bg-white p-3 active:bg-gray-50"
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className={featured ? "text-base font-semibold text-gray-900" : "text-sm font-medium text-gray-900"}>
            {course.name}
          </div>
          {(subtitle || course.club_name) && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              {course.club_name && course.club_name !== course.name ? `${course.club_name} · ` : ""}{subtitle}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {course.locked && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-600 rounded-md">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
              </svg>
              Locked
            </span>
          )}
          <MappedStatusBadge
            fullyMappedHoles={course.mapped.fully_mapped_holes}
            totalHoles={course.mapped.total_holes}
          />
        </div>
      </div>
    </Link>
  );
}

export default function CoursesPage() {
  const router = useRouter();
  const [data, setData] = useState<CoursesResponse | null>(null);
  const [query, setQuery] = useState("");
  const [showLookup, setShowLookup] = useState(false);
  const [manualPrefill, setManualPrefill] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/courses/list");
    if (res.ok) {
      const json = (await res.json()) as CoursesResponse;
      setData(json);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const featured = useMemo(() => {
    if (!data?.active_event_course_id) return null;
    return data.courses.find((c) => c.id === data.active_event_course_id) || null;
  }, [data]);

  const others = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    return data.courses
      .filter((c) => c.id !== data.active_event_course_id)
      .filter((c) => {
        if (!q) return true;
        return (
          c.name.toLowerCase().includes(q) ||
          (c.club_name || "").toLowerCase().includes(q) ||
          (c.city || "").toLowerCase().includes(q) ||
          (c.state || "").toLowerCase().includes(q)
        );
      });
  }, [data, query]);

  return (
    <div className="px-4 py-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Courses</h1>
        <button
          type="button"
          onClick={() => setShowLookup(true)}
          className="text-sm font-semibold text-green-700 active:opacity-70"
        >
          + Add new course
        </button>
      </div>

      {featured && (
        <div className="mb-6">
          <p className="text-[11px] uppercase tracking-wide text-gray-500 font-medium mb-2">
            Active event
          </p>
          <CourseCard course={featured} featured />
        </div>
      )}

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search courses..."
        className="w-full px-3 py-2.5 mb-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
      />

      {data === null ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading courses…</div>
      ) : others.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {query ? "No matching courses" : "No other courses yet"}
        </div>
      ) : (
        <div className="space-y-2">
          {others.map((c) => (
            <CourseCard key={c.id} course={c} />
          ))}
        </div>
      )}

      {manualPrefill && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 max-w-md w-[calc(100%-2rem)] bg-amber-50 border border-amber-200 text-amber-800 text-sm px-3 py-2 rounded-lg shadow-md z-50">
          We couldn&apos;t find <strong>{manualPrefill}</strong> automatically. Try the round-creation flow to add it manually.
          <button
            type="button"
            className="ml-2 underline font-semibold"
            onClick={() => setManualPrefill(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {showLookup && (
        <CourseLookupModal
          onClose={() => setShowLookup(false)}
          onCourseReady={(course) => {
            setShowLookup(false);
            router.push(`/courses/${course.id}`);
          }}
          onManualFallback={(prefill) => {
            setShowLookup(false);
            setManualPrefill(prefill.name);
          }}
        />
      )}
    </div>
  );
}
