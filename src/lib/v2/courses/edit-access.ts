import type { SupabaseClient } from "@supabase/supabase-js";
import { isAnyOrgAdmin } from "@/lib/v2/orgs";

/**
 * Edit-access gate for the universal v2 course library (#194). Courses are shared
 * across every group, so "admin" here means "an owner/admin of ANY org"
 * (isAnyOrgAdmin) — the same bar that already gates course deletion. A LOCKED
 * course can only be edited by such an admin; an unlocked course stays open to any
 * signed-in member (universal edit).
 *
 * Returns a discriminated result the API can turn straight into a response.
 */
export interface CourseEditGate {
  ok: boolean;
  status?: 403 | 404;
  error?: string;
  isAdmin: boolean;
  locked: boolean;
}

export async function courseEditGate(
  admin: SupabaseClient,
  courseId: string,
  userId: string,
): Promise<CourseEditGate> {
  const { data: course } = await admin
    .from("v2_courses")
    .select("locked")
    .eq("id", courseId)
    .maybeSingle();
  if (!course) return { ok: false, status: 404, error: "Course not found", isAdmin: false, locked: false };

  const locked = course.locked === true;
  const isAdmin = await isAnyOrgAdmin(admin, userId);
  if (locked && !isAdmin) {
    return { ok: false, status: 403, error: "This course is locked. Only group admins can edit it.", isAdmin, locked };
  }
  return { ok: true, isAdmin, locked };
}

/** Same gate, resolving the course from a tee id first. */
export async function courseEditGateByTee(
  admin: SupabaseClient,
  teeId: string,
  userId: string,
): Promise<CourseEditGate & { courseId?: string }> {
  const { data: tee } = await admin
    .from("v2_course_tees")
    .select("course_id")
    .eq("id", teeId)
    .maybeSingle();
  if (!tee) return { ok: false, status: 404, error: "Tee not found", isAdmin: false, locked: false };
  const gate = await courseEditGate(admin, tee.course_id as string, userId);
  return { ...gate, courseId: tee.course_id as string };
}
