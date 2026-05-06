import { NextResponse } from "next/server";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/admin/courses/{id}:
 *   delete:
 *     summary: Delete a course (admin only)
 *     description: |
 *       Cascades to course_tees and course_holes. Will fail with 409 if any
 *       rounds reference the course (rounds.course_id has no cascade).
 *     tags: [Admin]
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkPermissionAccess("manage_facilities");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();

  // Friendly check first — the FK violation message from PG is opaque.
  const { count: roundCount } = await supabase
    .from("rounds")
    .select("id", { count: "exact", head: true })
    .eq("course_id", id);
  if ((roundCount || 0) > 0) {
    return NextResponse.json(
      { error: `Can't delete: ${roundCount} round${roundCount === 1 ? "" : "s"} reference this course.` },
      { status: 409 }
    );
  }

  const { error } = await supabase.from("courses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
