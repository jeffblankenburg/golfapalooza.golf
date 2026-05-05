import Link from "next/link";
import CourseForm from "@/components/my-rounds/CourseForm";
import { BTN_BACK } from "@/lib/ui/buttons";

export default function NewCoursePage() {
  return (
    <div className="px-4 py-6 max-w-lg mx-auto">
      <Link href="/my-rounds/courses" className={BTN_BACK}>← Courses</Link>
      <h1 className="text-2xl font-bold text-gray-900 mt-1 mb-6">New Course</h1>
      <CourseForm />
    </div>
  );
}
