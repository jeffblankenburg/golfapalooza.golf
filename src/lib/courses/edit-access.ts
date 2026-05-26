import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

export type CourseEditAccess =
  | { allowed: true; isAdmin: boolean; locked: boolean; courseId: string }
  | { allowed: false; reason: "not_found" | "locked" };

/**
 * Issue #133. Loozer-editable courses: any signed-in user can edit an
 * unlocked course. Admins can edit any course. This gate is invoked from
 * every course-write API endpoint so locked-course writes never sneak
 * through, regardless of whether the call came from the public route or
 * the admin route.
 */
export async function checkCourseEditAccess(
  courseId: string,
): Promise<CourseEditAccess> {
  const admin = createAdminClient();
  const { data: course } = await admin
    .from("courses")
    .select("id, locked")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { allowed: false, reason: "not_found" };

  const adminUser = await checkIsAdmin();
  if (course.locked && !adminUser) {
    return { allowed: false, reason: "locked" };
  }
  return { allowed: true, isAdmin: !!adminUser, locked: course.locked, courseId };
}

/**
 * Stamp `updated_at`/`updated_by` on a course after a successful edit so the
 * detail page can show "Last edited by …". Best-effort: stamp failures
 * shouldn't fail the caller's write since the data already changed.
 */
export async function stampCourseEdit(
  courseId: string,
  effectiveUserId: string,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin
      .from("courses")
      .update({ updated_at: new Date().toISOString(), updated_by: effectiveUserId })
      .eq("id", courseId);
  } catch (err) {
    console.error("[stampCourseEdit] failed", err);
  }
}
