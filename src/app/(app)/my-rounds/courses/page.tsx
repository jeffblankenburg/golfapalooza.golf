import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { formatCourseName } from "@/lib/utils/course-display";
import AddCourseButton from "@/components/my-rounds/AddCourseButton";
import { BTN_BACK, BTN_PRIMARY } from "@/lib/ui/buttons";

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, club_name, city, state, hole_count")
    .order("name");

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/my-rounds" className={BTN_BACK}>← My Rounds</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Courses</h1>
        </div>
        <AddCourseButton />
      </div>

      <div className="space-y-2">
        {(courses || []).slice().sort((a, b) => formatCourseName(a).localeCompare(formatCourseName(b))).map((course) => (
          <Link
            key={course.id}
            href={`/my-rounds/courses/${course.id}`}
            className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-green-300 transition-colors"
          >
            <div className="font-medium text-gray-900">{formatCourseName(course)}</div>
            <div className="flex gap-2 text-sm text-gray-500 mt-0.5">
              {(course.city || course.state) && (
                <span>{[course.city, course.state].filter(Boolean).join(", ")}</span>
              )}
              <span className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">
                {course.hole_count} holes
              </span>
            </div>
          </Link>
        ))}

        {(!courses || courses.length === 0) && (
          <div className="text-center py-12">
            <p className="text-gray-500 mb-3">No courses yet</p>
            <AddCourseButton className={BTN_PRIMARY}>
              Add your first course →
            </AddCourseButton>
          </div>
        )}
      </div>
    </div>
  );
}
