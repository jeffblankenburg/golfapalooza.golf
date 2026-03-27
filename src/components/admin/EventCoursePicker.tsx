"use client";

import { useState, useEffect, useCallback } from "react";
import { BottomDrawer } from "@/components/admin/BottomDrawer";

interface CourseOption {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  hole_count: number;
}

export function EventCoursePicker({ tripId }: { tripId: string }) {
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const fetchData = useCallback(async () => {
    const [coursesRes, tripRes] = await Promise.all([
      fetch("/api/admin/course?list=true"),
      fetch(`/api/admin/trips?id=${tripId}`),
    ]);
    const coursesData = await coursesRes.json();
    const tripData = await tripRes.json();

    if (coursesData.courses) setCourses(coursesData.courses);
    if (tripData.trip?.course_id) setSelectedCourseId(tripData.trip.course_id);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCourseSelect = async (courseId: string | null) => {
    setSaving(true);
    setSelectedCourseId(courseId);

    const tripRes = await fetch(`/api/admin/trips?id=${tripId}`);
    const tripData = await tripRes.json();

    if (tripData.trip) {
      await fetch("/api/admin/trips", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: tripId,
          trip_name: tripData.trip.trip_name,
          trip_year: tripData.trip.trip_year,
          start_date: tripData.trip.start_date,
          location: tripData.trip.location,
          hotel_name: tripData.trip.hotel_name,
          hotel_address: tripData.trip.hotel_address,
          notes: tripData.trip.notes,
          course_id: courseId,
        }),
      });
    }

    setSaving(false);
    if (courseId !== null) setDrawerOpen(false);
  };

  const selectedCourse = courses.find((c) => c.id === selectedCourseId);

  const formatLocation = (city: string | null, state: string | null) => {
    if (city && state) return `${city}, ${state}`;
    return city || state || "";
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex justify-center py-2">
          <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Card */}
      <button
        onClick={() => setDrawerOpen(true)}
        className="w-full bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3 text-left active:bg-gray-50 transition-colors"
      >
        <div className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center flex-shrink-0">
          <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21V3l7 4 4-4 7 4v18l-7-4-4 4-7-4z" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-gray-900 truncate">
            {selectedCourse ? selectedCourse.name : "No course selected"}
          </div>
          {selectedCourse && (
            <div className="text-xs text-gray-500 truncate">
              {formatLocation(selectedCourse.city, selectedCourse.state)}
            </div>
          )}
        </div>
        {saving ? (
          <div className="w-5 h-5 border-2 border-green-600 border-t-transparent rounded-full animate-spin flex-shrink-0" />
        ) : (
          <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        )}
      </button>

      {/* Drawer */}
      <BottomDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} title="Select Course">
        <div className="divide-y divide-gray-100">
          {courses.map((course) => {
            const isSelected = course.id === selectedCourseId;
            return (
              <button
                key={course.id}
                onClick={() => handleCourseSelect(isSelected ? null : course.id)}
                disabled={saving}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-gray-50 transition-colors disabled:opacity-50"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{course.name}</div>
                  {(course.city || course.state) && (
                    <div className="text-xs text-gray-500">
                      {formatLocation(course.city, course.state)}
                    </div>
                  )}
                </div>
                {isSelected && (
                  <svg className="w-5 h-5 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      </BottomDrawer>
    </>
  );
}
