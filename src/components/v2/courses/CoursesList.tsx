"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CourseLookupModal from "@/components/v2/courses/CourseLookupModal";
import { MappedStatusBadge } from "@/components/v2/courses/MappedStatusBadge";

interface CourseRow {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  updated_at: string | null;
  mapped: { set_points: number; total_points: number; fully_mapped_holes: number; total_holes: number };
}

function CourseCard({ course, slug }: { course: CourseRow; slug: string }) {
  const subtitle = [course.city, course.state].filter(Boolean).join(", ");
  return (
    <Link
      href={`/new/${slug}/courses/${course.id}`}
      className="block rounded-xl border border-gray-200 bg-white p-3 active:bg-gray-50"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-gray-900">{course.name}</div>
          {(subtitle || course.club_name) && (
            <div className="text-xs text-gray-500 mt-0.5 truncate">
              {course.club_name && course.club_name !== course.name ? `${course.club_name} — ` : ""}{subtitle}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <MappedStatusBadge
            fullyMappedHoles={course.mapped.fully_mapped_holes}
            totalHoles={course.mapped.total_holes}
          />
        </div>
      </div>
    </Link>
  );
}

export default function CoursesList({ slug }: { slug: string }) {
  const router = useRouter();
  const [courses, setCourses] = useState<CourseRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [showLookup, setShowLookup] = useState(false);

  const fetchCourses = useCallback(async (): Promise<CourseRow[]> => {
    const res = await fetch("/api/v2/courses/list");
    return res.ok ? ((await res.json()).courses || []) : [];
  }, []);
  // For the focus listeners (event callbacks — setState there is fine).
  const load = useCallback(async () => { setCourses(await fetchCourses()); }, [fetchCourses]);

  useEffect(() => {
    let active = true;
    (async () => { const c = await fetchCourses(); if (active) setCourses(c); })();
    return () => { active = false; };
  }, [fetchCourses]);

  // Refetch on focus so returning from an edit shows fresh mapped totals.
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", load);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", load);
    };
  }, [load]);

  const filtered = useMemo(() => {
    if (!courses) return [];
    const q = query.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.club_name || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q));
  }, [courses, query]);

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto">
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

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search courses..."
        className="w-full px-3 py-2.5 mb-3 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
      />

      {courses === null ? (
        <div className="py-12 text-center text-sm text-gray-500">Loading courses…</div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {query ? "No matching courses" : "No courses yet — add one above."}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <CourseCard key={c.id} course={c} slug={slug} />
          ))}
        </div>
      )}

      {showLookup && (
        <CourseLookupModal
          onClose={() => setShowLookup(false)}
          onCourseReady={(course) => {
            setShowLookup(false);
            router.push(`/new/${slug}/courses/${course.id}`);
          }}
          onManualFallback={(prefill) => {
            setShowLookup(false);
            const params = new URLSearchParams();
            if (prefill.name) params.set("name", prefill.name);
            if (prefill.city) params.set("city", prefill.city);
            if (prefill.state) params.set("state", prefill.state);
            router.push(`/new/${slug}/courses/new?${params.toString()}`);
          }}
        />
      )}
    </div>
  );
}
