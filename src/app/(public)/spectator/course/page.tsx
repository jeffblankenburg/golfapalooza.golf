import { createAdminClient } from "@/lib/supabase/admin";
import { CourseScorecard } from "@/components/course/CourseScorecard";
import { getCourseData } from "@/lib/course-data.server";

export default async function SpectatorCoursePage() {
  const adminClient = createAdminClient();
  const course = await getCourseData(adminClient);

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <svg
          className="w-16 h-16 text-gray-300 mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M3 21V3l7 4 4-4 7 4v18l-7-4-4 4-7-4z"
          />
        </svg>
        <p className="text-gray-500 text-lg font-medium">
          Course info coming soon
        </p>
        <p className="text-gray-400 text-sm mt-1">
          Check back once the course has been set up.
        </p>
      </div>
    );
  }

  return <CourseScorecard course={course} />;
}
