"use client";

import { useState, useEffect, useCallback } from "react";
import { CourseManager } from "./CourseManager";

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

  const handleCourseChange = async (courseId: string) => {
    setSaving(true);
    const newCourseId = courseId || null;
    setSelectedCourseId(newCourseId);

    // Fetch current trip data to include required fields in PUT
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
          course_id: newCourseId,
        }),
      });
    }

    setSaving(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-6">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs text-gray-500 uppercase tracking-wide font-medium mb-1">
          Course for this event
        </label>
        <select
          value={selectedCourseId || ""}
          onChange={(e) => handleCourseChange(e.target.value)}
          disabled={saving}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-[16px] bg-white disabled:opacity-50"
        >
          <option value="">No course selected</option>
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.city ? ` — ${c.city}` : ""}
              {c.state ? `, ${c.state}` : ""}
            </option>
          ))}
        </select>
      </div>

      {selectedCourseId && (
        <div className="border-t border-gray-100 pt-4">
          <CourseManager courseId={selectedCourseId} />
        </div>
      )}
    </div>
  );
}
