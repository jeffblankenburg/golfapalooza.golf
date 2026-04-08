import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export default async function CoursesPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name, city, state, hole_count")
    .order("name");

  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <div className="flex items-center justify-between mb-4">
        <div>
          <Link href="/my-rounds" className="text-sm text-gray-500 hover:text-gray-700">← My Rounds</Link>
          <h1 className="text-2xl font-bold text-gray-900 mt-1">Courses</h1>
        </div>
        <Link
          href="/my-rounds/courses/new"
          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors"
        >
          + Add
        </Link>
      </div>

      <div className="space-y-2">
        {(courses || []).map((course) => (
          <Link
            key={course.id}
            href={`/my-rounds/courses/${course.id}`}
            className="block bg-white border border-gray-200 rounded-lg p-3 hover:border-green-300 transition-colors"
          >
            <div className="font-medium text-gray-900">{course.name}</div>
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
            <Link href="/my-rounds/courses/new" className="text-green-700 font-medium">
              Add your first course →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
