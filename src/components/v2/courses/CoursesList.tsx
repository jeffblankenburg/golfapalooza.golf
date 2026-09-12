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
  updated_at?: string | null;
  mapped?: { set_points: number; total_points: number; fully_mapped_holes: number; total_holes: number };
  distance_mi?: number;
}

const RADIUS_MI = 50;

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
        <div className="shrink-0 flex flex-col items-end gap-1">
          {typeof course.distance_mi === "number" && (
            <span className="text-xs font-semibold text-green-700 whitespace-nowrap">{Math.round(course.distance_mi)} mi</span>
          )}
          {course.mapped && (
            <MappedStatusBadge
              fullyMappedHoles={course.mapped.fully_mapped_holes}
              totalHoles={course.mapped.total_holes}
            />
          )}
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
  const [mode, setMode] = useState<"all" | "near">("all");
  const [nearResults, setNearResults] = useState<CourseRow[] | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const fetchCourses = useCallback(async (): Promise<CourseRow[]> => {
    const res = await fetch("/api/v2/courses/list");
    return res.ok ? ((await res.json()).courses || []) : [];
  }, []);
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

  const coursesById = useMemo(() => {
    const m = new Map<string, CourseRow>();
    for (const c of courses || []) m.set(c.id, c);
    return m;
  }, [courses]);

  function findNearby() {
    setGeoError(null);
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setGeoError("Location isn't available on this device.");
      return;
    }
    setMode("near");
    setNearResults(null);
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`/api/v2/courses?lat=${latitude}&lng=${longitude}&radius=${RADIUS_MI}`);
          const data = res.ok ? await res.json() : { courses: [] };
          // Merge in mapped-status from the full list (the nearby endpoint omits it).
          const enriched: CourseRow[] = (data.courses || []).map((c: CourseRow) => ({
            ...coursesById.get(c.id),
            ...c,
          }));
          setNearResults(enriched);
        } catch {
          setNearResults([]);
          setGeoError("Couldn't load nearby courses.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        setMode("all");
        setNearResults(null);
        setGeoError(
          err.code === err.PERMISSION_DENIED
            ? "Location permission denied — allow it to find courses near you."
            : "Couldn't get your location.",
        );
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  }

  function showAll() {
    setMode("all");
    setNearResults(null);
    setGeoError(null);
  }

  const activeList = mode === "near" ? nearResults : courses;
  const loadingList = mode === "near" ? locating || nearResults === null : courses === null;

  const filtered = useMemo(() => {
    const list = activeList || [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      (c.club_name || "").toLowerCase().includes(q) ||
      (c.city || "").toLowerCase().includes(q) ||
      (c.state || "").toLowerCase().includes(q));
  }, [activeList, query]);

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

      <div className="flex gap-2 mb-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses..."
          className="flex-1 min-w-0 px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40"
        />
        <button
          type="button"
          onClick={mode === "near" ? showAll : findNearby}
          className={`shrink-0 inline-flex items-center gap-1 px-3 rounded-lg text-sm font-semibold border ${
            mode === "near" ? "bg-green-600 text-white border-green-600" : "border-gray-200 text-green-700"
          }`}
        >
          <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <path d="M21 10c0 7-9 12-9 12s-9-5-9-12a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" />
          </svg>
          {mode === "near" ? "Show all" : "Near me"}
        </button>
      </div>

      {geoError && <p className="mb-3 text-xs text-red-600">{geoError}</p>}
      {mode === "near" && !geoError && !loadingList && (
        <p className="mb-3 text-xs text-gray-500">
          {filtered.length} course{filtered.length === 1 ? "" : "s"} within {RADIUS_MI} miles
        </p>
      )}

      {loadingList ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {mode === "near" ? "Finding courses near you…" : "Loading courses…"}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-sm text-gray-500">
          {mode === "near"
            ? `No courses within ${RADIUS_MI} miles.`
            : query
              ? "No matching courses"
              : "No courses yet — add one above."}
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
