import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/contests/{contestId}/publish-tee-sheet:
 *   post:
 *     summary: Publish a contest's tee sheet (teams + tee times) to the public Scorecards page
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: contestId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tee sheet published; returns the timestamp
 *       401:
 *         description: Unauthorized
 *   delete:
 *     summary: Hide a contest's tee sheet again
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: contestId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Tee sheet hidden
 *       401:
 *         description: Unauthorized
 */
export async function POST(_request: Request, ctx: { params: Promise<{ contestId: string }> }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contestId } = await ctx.params;
  const now = new Date().toISOString();

  const { error } = await createAdminClient()
    .from("contests")
    .update({ tee_sheet_published_at: now })
    .eq("id", contestId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tee_sheet_published_at: now });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ contestId: string }> }) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { contestId } = await ctx.params;

  const { error } = await createAdminClient()
    .from("contests")
    .update({ tee_sheet_published_at: null })
    .eq("id", contestId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ tee_sheet_published_at: null });
}
