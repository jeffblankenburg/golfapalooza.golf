import Link from "next/link";
import CourseForm from "@/components/my-rounds/CourseForm";

export default function NewCoursePage() {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/my-rounds/courses" className="text-sm text-gray-500 hover:text-gray-700">← Courses</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-1 mb-6">New Course</h1>
      <CourseForm />
    </div>
  );
}
