"use client";

import { useState, useEffect, useCallback } from "react";
import { CourseManager } from "./CourseManager";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

interface CourseOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number;
}

export function CourseListManager() {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newState, setNewState] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  const fetchCourses = useCallback(async () => {
    const res = await fetch("/api/admin/course?list=true");
    const data = await res.json();
    if (data.courses) setCourses(data.courses);
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
      <p className="text-sm text-gray-500 mb-6">
        Golf courses available for events
      </p>

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
            onClick={() => setShowCreate(!showCreate)}
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
          {courses.map((course) => (
            <button
              key={course.id}
              onClick={() => setSelectedCourseId(course.id)}
              className="w-full flex items-center px-4 py-3 text-left active:bg-gray-50"
            >
              <div className="flex-1">
                <div className="text-sm font-medium text-gray-900">
                  {course.name}
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
    </div>
  );
}
