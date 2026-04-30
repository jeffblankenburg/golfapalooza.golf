import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { loadParsedWorkbook } from "@/lib/history/load-workbook";

/**
 * @swagger
 * /api/admin/history/match:
 *   put:
 *     summary: Set or clear users.workbook_name for a single Loozer (issue #114)
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               workbookName:
 *                 type: string
 *               userId:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       200:
 *         description: Match updated
 *       400:
 *         description: Invalid workbook name or user
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { workbookName, userId } = (await request.json()) as {
    workbookName?: string;
    userId?: string | null;
  };

  if (!workbookName || typeof workbookName !== "string") {
    return NextResponse.json({ error: "workbookName is required" }, { status: 400 });
  }

  // Validate workbookName actually exists in the parsed workbook so admins
  // can't typo themselves into orphaned rows.
  const parsed = await loadParsedWorkbook();
  if (!parsed.loozers.some((l) => l.workbookName === workbookName)) {
    return NextResponse.json(
      { error: `Workbook name "${workbookName}" is not in the parsed workbook` },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // Whether assigning or clearing, first NULL any other user currently holding
  // this workbook_name so the unique index never blocks the update.
  const { error: clearErr } = await adminClient
    .from("users")
    .update({ workbook_name: null })
    .eq("workbook_name", workbookName);
  if (clearErr) {
    return NextResponse.json({ error: clearErr.message }, { status: 500 });
  }

  if (userId) {
    // Validate target user exists.
    const { data: target } = await adminClient
      .from("users")
      .select("id")
      .eq("id", userId)
      .maybeSingle();
    if (!target) {
      return NextResponse.json({ error: "User not found" }, { status: 400 });
    }

    const { error } = await adminClient
      .from("users")
      .update({ workbook_name: workbookName })
      .eq("id", userId);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
