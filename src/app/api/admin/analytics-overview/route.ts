import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAnyPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/analytics-overview:
 *   get:
 *     summary: Admin-friendly analytics overview
 *     description: Daily users/page-views for the last 30 days, list of Loozers who have not installed the PWA, and list of Loozers inactive for the configurable window.
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: inactive_days
 *         schema:
 *           type: integer
 *           enum: [7, 14, 30]
 *           default: 7
 *     responses:
 *       200:
 *         description: Overview payload
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: NextRequest) {
  const access = await checkAnyPermissionAccess();
  if (!access) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const raw = parseInt(searchParams.get("days") || searchParams.get("inactive_days") || "7", 10);
  const windowDays = [7, 14, 30].includes(raw) ? raw : 7;

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .rpc("analytics_overview_v1", { window_days: windowDays })
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || {});
}
