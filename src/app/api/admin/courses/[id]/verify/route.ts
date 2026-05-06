import { NextResponse } from "next/server";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/admin/courses/{id}/verify:
 *   post:
 *     summary: Mark a course as verified by admin
 *     tags: [Admin]
 *   delete:
 *     summary: Un-verify a course (revert to community-submitted)
 *     tags: [Admin]
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkPermissionAccess("manage_facilities");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("courses")
    .update({ verified: true, verified_by: admin.id, verified_at: new Date().toISOString() })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await checkPermissionAccess("manage_facilities");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const supabase = createAdminClient();
  const { error } = await supabase
    .from("courses")
    .update({ verified: false, verified_by: null, verified_at: null })
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
