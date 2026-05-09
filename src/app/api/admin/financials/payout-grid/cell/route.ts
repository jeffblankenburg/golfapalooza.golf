import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/financials/payout-grid/cell:
 *   put:
 *     summary: Toggle paid status for a single Loozer × event cell
 *     tags: [Admin]
 *     description: |
 *       Body: `{ trip_id, user_id, event_key, paid, pickem_contest_id? }`.
 *       For Pickem cells, pass `pickem_contest_id` and the write goes to
 *       `pickem_payouts`. Otherwise the upsert hits `payout_paid_status`.
 */
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { trip_id, user_id, event_key, paid, pickem_contest_id } = body;
  if (!trip_id || !user_id || !event_key || typeof paid !== "boolean") {
    return NextResponse.json(
      { error: "trip_id, user_id, event_key, and paid are required" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  if (pickem_contest_id) {
    const { error } = await adminClient
      .from("pickem_payouts")
      .upsert(
        {
          contest_id: pickem_contest_id,
          user_id,
          paid_out: paid,
          paid_out_at: paid ? new Date().toISOString() : null,
        },
        { onConflict: "contest_id,user_id" },
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const { error } = await adminClient
    .from("payout_paid_status")
    .upsert(
      {
        trip_id,
        user_id,
        cell_key: event_key,
        paid,
        paid_at: paid ? new Date().toISOString() : null,
        paid_by: paid ? admin.id : null,
      },
      { onConflict: "trip_id,user_id,cell_key" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
