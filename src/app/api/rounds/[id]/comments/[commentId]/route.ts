import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/rounds/{id}/comments/{commentId}:
 *   delete:
 *     summary: Delete a round comment (own comment, or any as admin)
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: commentId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { commentId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const isAdmin = !!(await checkIsAdmin());
  const admin = createAdminClient();

  const { data: comment } = await admin
    .from("round_comments")
    .select("id, sender_id")
    .eq("id", commentId)
    .maybeSingle();

  if (!comment) {
    // Idempotent: already gone.
    return NextResponse.json({ success: true, already_deleted: true });
  }

  if (comment.sender_id !== effectiveUserId && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await admin
    .from("round_comments")
    .delete()
    .eq("id", commentId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
