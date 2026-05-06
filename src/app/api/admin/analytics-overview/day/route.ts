import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/analytics-overview/day:
 *   get:
 *     summary: Per-day analytics breakdown for a single calendar day
 *     description: Counts of users, page views, logins, chat messages, score saves, gallery uploads, notification clicks, and errors for the requested day, plus the list of active Loozers and top pages.
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: date
 *         required: true
 *         schema:
 *           type: string
 *           format: date
 *         description: Day to query in YYYY-MM-DD form
 *     responses:
 *       200:
 *         description: Day breakdown
 *       400:
 *         description: Invalid or missing date
 *       403:
 *         description: Forbidden
 */
export async function GET(request: NextRequest) {
  const access = await checkAnyPermissionAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .rpc("analytics_day_detail", { target_day: date })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || {});
}
