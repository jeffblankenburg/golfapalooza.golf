import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { loadPayoutSheet } from "@/lib/payout-events/compute";

/**
 * @swagger
 * /api/admin/financials/payout-events:
 *   get:
 *     summary: List payout-sheet events for a trip with computed totals
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Defaults to the active trip when omitted.
 *     responses:
 *       200:
 *         description: Rows with participant_count and total computed live
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  let tripId = url.searchParams.get("trip_id");
  const adminClient = createAdminClient();

  if (!tripId) {
    const { data: active } = await adminClient
      .from("trip_settings")
      .select("id")
      .eq("status", "active")
      .single();
    tripId = active?.id ?? null;
  }
  if (!tripId) {
    return NextResponse.json({ error: "No trip_id provided and no active trip" }, { status: 400 });
  }

  const rows = await loadPayoutSheet(adminClient, tripId);
  return NextResponse.json({ trip_id: tripId, rows });
}

/**
 * @swagger
 * /api/admin/financials/payout-events:
 *   post:
 *     summary: Create a new payout-sheet event row
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Row created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const {
      trip_id,
      label,
      sort_order,
      participant_source,
      source_ref,
      source_filter,
      amount_per_participant,
      day_count,
      is_payout,
      winner_source,
      winner_day_number,
      cost_item_id,
      payout_splits,
      contest_id,
      notes,
    } = body;

    if (!trip_id || !label || !participant_source) {
      return NextResponse.json(
        { error: "trip_id, label, and participant_source are required" },
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    // When linked to a contest, contest-level fields write to the contest;
    // the row's own copies start dead-letter (null). Without a contest the
    // row holds them itself (Lodge-style pass-through).
    const insertPayload: Record<string, unknown> = {
      trip_id,
      label,
      sort_order: sort_order ?? 0,
      participant_source,
      source_ref: source_ref ?? null,
      source_filter: source_filter ?? null,
      amount_per_participant: amount_per_participant ?? 0,
      day_count: day_count ?? 1,
      is_payout: is_payout ?? true,
      winner_source: winner_source ?? "none",
      winner_day_number: winner_day_number ?? null,
      contest_id: contest_id ?? null,
      cost_item_id: contest_id ? null : (cost_item_id ?? null),
      payout_splits: contest_id ? null : (payout_splits ?? null),
      notes: notes ?? null,
    };

    const { data, error } = await adminClient
      .from("payout_sheet_events")
      .insert(insertPayload)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (contest_id) {
      const contestUpdates: Record<string, unknown> = {};
      if (cost_item_id !== undefined) contestUpdates.buy_in_cost_item_id = cost_item_id;
      if (payout_splits !== undefined) contestUpdates.payout_splits = payout_splits;
      if (Object.keys(contestUpdates).length > 0) {
        const { error: contestErr } = await adminClient
          .from("contests")
          .update(contestUpdates)
          .eq("id", contest_id);
        if (contestErr) return NextResponse.json({ error: contestErr.message }, { status: 500 });
      }
    }

    // Re-load through loadPayoutSheet so the response carries the projected
    // (contest-overridden) values.
    const sheet = await loadPayoutSheet(adminClient, trip_id);
    return NextResponse.json({ row: sheet.find((r) => r.id === data.id) ?? data });
  } catch (err) {
    console.error("Create payout event error:", err);
    return NextResponse.json({ error: "Failed to create row" }, { status: 500 });
  }
}
