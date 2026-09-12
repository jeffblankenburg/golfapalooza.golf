import { Suspense } from "react";
import { redirect } from "next/navigation";
import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { getPlatformContext } from "@/lib/v2/context";
import { loadResolvedFeatures } from "@/lib/v2/features-server";
import { isFeatureVisible } from "@/lib/v2/features";
import CourseForm from "@/components/v2/courses/CourseForm";

/** Manual course entry (reached from the lookup modal's manual fallback). */
export default async function NewCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const isAdmin = org.role === "owner" || org.role === "admin";
  const supabase = await v2ServerClient();
  const resolved = await loadResolvedFeatures(supabase, org.id, null);
  if (!isFeatureVisible(resolved, "courses", isAdmin)) redirect(`/new/${slug}`);

  return (
    <div className="px-4 py-4 max-w-2xl mx-auto">
      <Link href={`/new/${slug}/courses`} className="inline-flex items-center gap-1 text-sm font-medium text-green-700 mb-3">
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Courses
      </Link>
      <h1 className="text-2xl font-bold text-gray-900 mb-4">Add a course</h1>
      <Suspense>
        <CourseForm slug={slug} />
      </Suspense>
    </div>
  );
}
