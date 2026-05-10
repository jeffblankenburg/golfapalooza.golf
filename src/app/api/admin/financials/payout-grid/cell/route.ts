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
 *       Body: `{ user_id, event_key, paid }`.
 *       Writes `contest_winners.paid` for the matching contest's row.
 */
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { user_id, event_key, paid, pickem_contest_id } = body;
  if (!user_id || !event_key || typeof paid !== "boolean") {
    return NextResponse.json(
      { error: "user_id, event_key, and paid are required" },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();

  // Resolve event_key (payout_sheet_events.id) to a contest_id.
  // pickem_contest_id is accepted as a fallback for callers that pass
  // the contest directly.
  const { data: row } = await adminClient
    .from("payout_sheet_events")
    .select("contest_id")
    .eq("id", event_key)
    .single();
  const contestId = row?.contest_id || pickem_contest_id || null;
  if (!contestId) {
    return NextResponse.json(
      { error: "Event has no linked contest; can't toggle paid status." },
      { status: 400 },
    );
  }

  const { error: cwErr } = await adminClient
    .from("contest_winners")
    .update({
      paid,
      paid_at: paid ? new Date().toISOString() : null,
      paid_by: paid ? admin.id : null,
    })
    .eq("contest_id", contestId)
    .eq("user_id", user_id);
  if (cwErr) return NextResponse.json({ error: cwErr.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
