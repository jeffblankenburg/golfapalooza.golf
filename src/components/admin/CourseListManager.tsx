"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { CourseManager } from "./CourseManager";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import CourseLookupModal from "@/components/my-rounds/CourseLookupModal";
import { formatCourseName } from "@/lib/utils/course-display";

interface CourseOption {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  hole_count: number;
  locked: boolean;
  source: "manual" | "gcapi" | "ai";
  verified: boolean;
}

export function CourseListManager() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [unverifiedCount, setUnverifiedCount] = useState(0);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const [lookupOpen, setLookupOpen] = useState(false);

  const fetchCourses = useCallback(async () => {
    const res = await fetch("/api/admin/course?list=true");
    const data = await res.json();
    if (data.courses) setCourses(data.courses);
    if (typeof data.unverified_count === "number") setUnverifiedCount(data.unverified_count);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchCourses();
  }, [fetchCourses]);

  const createCourse = async () => {
    if (!newName.trim()) return;
    setCreating(true);

    const res = await fetch("/api/admin/course", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: newName.trim(),
        city: newCity.trim() || null,
        state: newState.trim() || null,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to create course");
      setCreating(false);
      return;
    } else {
      const data = await res.json();
      if (data.course) setSelectedCourseId(data.course.id);
    }

    await fetchCourses();
    setNewName("");
    setNewCity("");
    setNewState("");
    setShowCreate(false);
    setCreating(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // If a course is selected, show its editor
  if (selectedCourseId) {
    return (
      <div>
        <button
          onClick={() => setSelectedCourseId(null)}
          className="flex items-center gap-1 text-green-700 text-sm font-medium mb-4"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Back to Courses
        </button>
        <CourseManager courseId={selectedCourseId} />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-1">Courses</h1>
      <p className="text-sm text-gray-500 mb-3">
        Golf courses available for events
      </p>

      {unverifiedCount > 0 && (
        <Link
          href="/admin/courses/unverified"
          className="block mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-sm text-amber-900 hover:bg-amber-100"
        >
          <span className="font-semibold">{unverifiedCount}</span> course{unverifiedCount === 1 ? "" : "s"} awaiting verification →
        </Link>
      )}

      {error && (
        <div className="bg-red-50 text-red-700 p-3 rounded-lg mb-4 text-sm">
          {error}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">
            All Courses ({courses.length})
          </h2>
          <button
            onClick={() => setLookupOpen(true)}
            className="text-xs text-green-700 font-medium px-2 py-1 rounded-lg hover:bg-green-50"
          >
            + Add
          </button>
        </div>

        {showCreate && (
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 space-y-2">
            <input
              type="text"
              placeholder="Course name"
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
            />
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="City"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
              />
              <input
                type="text"
                placeholder="State"
                value={newState}
                onChange={(e) => setNewState(e.target.value)}
                className="w-20 border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={createCourse}
                disabled={!newName.trim() || creating}
                className="flex-1 bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
              >
                {creating ? "Creating..." : "Create"}
              </button>
              <button
                onClick={() => {
                  setShowCreate(false);
                  setNewName("");
                  setNewCity("");
                  setNewState("");
                }}
                className="px-4 text-sm text-gray-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-50">
          {[...courses].sort((a, b) => formatCourseName(a).localeCompare(formatCourseName(b))).map((course) => (
            <button
              key={course.id}
              onClick={() => setSelectedCourseId(course.id)}
              className="w-full flex items-center px-4 py-3 text-left active:bg-gray-50"
            >
              <div className="flex-1">
                <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 flex-wrap">
                  {formatCourseName(course)}
                  {course.locked && (
                    <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                    </svg>
                  )}
                  {course.source !== "manual" && (
                    <span className={`text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${
                      course.source === "ai" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"
                    }`}>{course.source}</span>
                  )}
                  {!course.verified && (
                    <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">unverified</span>
                  )}
                </div>
                <div className="text-xs text-gray-500">
                  {[course.city, course.state].filter(Boolean).join(", ") ||
                    "No location"}
                  {" · "}
                  {course.hole_count} holes
                </div>
              </div>
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          ))}
          {courses.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-gray-400">
              No courses yet. Add one to get started.
            </div>
          )}
        </div>
      </div>

      {lookupOpen && (
        <CourseLookupModal
          onClose={() => {
            setLookupOpen(false);
            // Refetch on close in case the modal performed a bulk import
            // and the user closed without picking one — the list might
            // otherwise show stale counts until the next navigation.
            fetchCourses();
          }}
          onCourseReady={(c) => {
            setLookupOpen(false);
            fetchCourses();
            setSelectedCourseId(c.id);
          }}
          onManualFallback={(prefill) => {
            setLookupOpen(false);
            setNewName(prefill.name || "");
            setNewCity(prefill.city || "");
            setNewState(prefill.state || "");
            setShowCreate(true);
          }}
        />
      )}
    </div>
  );
}
