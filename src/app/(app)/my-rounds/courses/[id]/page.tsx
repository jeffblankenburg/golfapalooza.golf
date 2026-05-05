"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import TeeList from "@/components/my-rounds/TeeList";
import CourseForm from "@/components/my-rounds/CourseForm";
import { formatCourseName } from "@/lib/utils/course-display";
import { BTN_BACK, BTN_NEUTRAL, BTN_PRIMARY } from "@/lib/ui/buttons";

interface CourseData {
  id: string;
  name: string;
  club_name: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hole_count: 9 | 18;
  locked: boolean;
}

interface TeeData {
  id: string;
  tee_name: string;
  tee_color: string | null;
  course_rating: number;
  slope_rating: number;
  par: number;
  total_yards: number | null;
  front_nine_rating: number | null;
  front_nine_slope: number | null;
  back_nine_rating: number | null;
  back_nine_slope: number | null;
}

export default function CourseDetailPage() {
  const params = useParams();
  const courseId = params.id as string;

  const [data, setData] = useState<{ course: CourseData | null; tees: TeeData[] } | null>(null);
  const [editing, setEditing] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    async function fetchData() {
      const res = await fetch(`/api/courses/${courseId}`);
      const json = await res.json();
      setData({ course: json.course, tees: json.tees || [] });
    }
    fetchData();
  }, [courseId, refreshKey]);

  const course = data?.course ?? null;
  const tees = data?.tees ?? [];
  const locked = course?.locked ?? false;

  if (!data) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <div className="text-center py-12 text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="px-4 py-6 max-w-lg mx-auto">
        <div className="text-center py-12 text-gray-500">Course not found</div>
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/my-rounds/courses" className={BTN_BACK}>← Courses</Link>

      {editing ? (
        <div className="mt-4">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Edit Course</h1>
          <CourseForm course={course} />
          <button
            onClick={() => {
              setEditing(false);
              setRefreshKey((k) => k + 1);
            }}
            className={`mt-3 ${BTN_NEUTRAL}`}
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <div className="mt-2 mb-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{formatCourseName(course)}</h1>
                  {locked && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-medium">
                      Locked
                    </span>
                  )}
                </div>
                {(course.city || course.state) && (
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[course.city, course.state].filter(Boolean).join(", ")}
                  </p>
                )}
                {course.address && (
                  <p className="text-xs text-gray-400 mt-0.5">{course.address}</p>
                )}
              </div>
              {!locked && (
                <button
                  onClick={() => setEditing(true)}
                  className={BTN_PRIMARY}
                >
                  Edit
                </button>
              )}
            </div>
            <div className="flex gap-3 mt-3 text-sm text-gray-600">
              <span className="bg-gray-100 px-2 py-1 rounded">{course.hole_count} holes</span>
              {course.phone && <span>{course.phone}</span>}
            </div>
          </div>

          <TeeList
            courseId={courseId}
            tees={tees}
            onRefresh={() => setRefreshKey((k) => k + 1)}
            locked={locked}
          />
        </>
      )}
    </div>
  );
}
