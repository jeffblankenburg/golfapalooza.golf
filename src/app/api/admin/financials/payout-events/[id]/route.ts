import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { loadPayoutSheet } from "@/lib/payout-events/compute";

/**
 * @swagger
 * /api/admin/financials/payout-events/{id}:
 *   put:
 *     summary: Update a payout-sheet event row
 *     tags: [Admin]
 *   delete:
 *     summary: Delete a payout-sheet event row
 *     tags: [Admin]
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  // Two destinations:
  //   - Row-level fields (label, sort_order, presentation, pass-through).
  //   - Contest-level fields (cost_item_id → buy_in_cost_item_id, payout_splits).
  // When the row has a contest_id, contest-level fields write to the contest;
  // the row's own copies are dead-letter (kept until a later migration drops
  // them). Lodge-style rows have no contest, so the row's columns still hold.
  const ROW_FIELDS = [
    "label",
    "sort_order",
    "participant_source",
    "source_ref",
    "source_filter",
    "amount_per_participant",
    "day_count",
    "is_payout",
    "winner_source",
    "winner_day_number",
    "contest_id",
    "notes",
  ] as const;
  const CONTEST_FIELDS = ["cost_item_id", "payout_splits"] as const;

  const adminClient = createAdminClient();

  // Fetch the row's current contest_id so we know where contest-level
  // writes should land (even when the body isn't changing it).
  const { data: existing, error: fetchErr } = await adminClient
    .from("payout_sheet_events")
    .select("id, contest_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  const targetContestId =
    "contest_id" in body && body.contest_id !== undefined ? body.contest_id : existing.contest_id;

  const rowUpdates: Record<string, unknown> = {};
  for (const key of ROW_FIELDS) {
    if (key in body) rowUpdates[key] = body[key];
  }
  // Without a contest, contest-level fields still need somewhere to live —
  // fall back to the row's columns.
  if (!targetContestId) {
    for (const key of CONTEST_FIELDS) {
      if (key in body) rowUpdates[key] = body[key];
    }
  }

  if (Object.keys(rowUpdates).length > 0) {
    const { error: rowErr } = await adminClient
      .from("payout_sheet_events")
      .update(rowUpdates)
      .eq("id", id);
    if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  }

  if (targetContestId) {
    const contestUpdates: Record<string, unknown> = {};
    if ("cost_item_id" in body) contestUpdates.buy_in_cost_item_id = body.cost_item_id;
    if ("payout_splits" in body) contestUpdates.payout_splits = body.payout_splits;
    if (Object.keys(contestUpdates).length > 0) {
      const { error: contestErr } = await adminClient
        .from("contests")
        .update(contestUpdates)
        .eq("id", targetContestId);
      if (contestErr) return NextResponse.json({ error: contestErr.message }, { status: 500 });
    }
  }

  // Return the row in its projected form so the client sees the
  // resolved contest-derived values, not stale row columns.
  const { data: refreshed } = await adminClient
    .from("payout_sheet_events")
    .select("trip_id")
    .eq("id", id)
    .single();
  if (!refreshed) return NextResponse.json({ row: null });
  const sheet = await loadPayoutSheet(adminClient, refreshed.trip_id);
  return NextResponse.json({ row: sheet.find((r) => r.id === id) ?? null });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();
  const { error } = await adminClient.from("payout_sheet_events").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
