import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { loadPayoutSheet } from "@/lib/payout-events/compute";
import { denomTarget, overrideToMap, totalFromDenom } from "@/lib/payout-events/denominations";

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

  // Row-level fields (presentation + Lodge-pass-through plumbing) live on
  // the row. Contest-level fields (cost_item_id, payout_splits) route to
  // the linked contest's columns.
  const ROW_FIELDS = [
    "label",
    "sort_order",
    "participant_source",
    "source_ref",
    "source_filter",
    "amount_per_participant",
    "day_count",
    "is_payout",
    "contest_id",
    "notes",
    "payee_count",
    "denomination_override",
  ] as const;

  const adminClient = createAdminClient();

  const { data: existing, error: fetchErr } = await adminClient
    .from("payout_sheet_events")
    .select("id, contest_id, trip_id")
    .eq("id", id)
    .single();
  if (fetchErr || !existing) {
    return NextResponse.json({ error: "Row not found" }, { status: 404 });
  }
  const targetContestId =
    "contest_id" in body && body.contest_id !== undefined ? body.contest_id : existing.contest_id;

  // A hand-picked denomination override must sum to the row's exact pot
  // (whole dollars). Reject mismatches so a bad payload can never persist a
  // breakdown that under/over-pays — the UI already blocks this, this is the
  // server-side backstop. `null` (clear override) skips the check.
  if ("denomination_override" in body && body.denomination_override != null) {
    const sheet = await loadPayoutSheet(adminClient, existing.trip_id);
    const current = sheet.find((r) => r.id === id);
    if (current) {
      const target = denomTarget(current.total);
      const billed = totalFromDenom(overrideToMap(body.denomination_override));
      if (billed !== target) {
        return NextResponse.json(
          { error: `Denominations total $${billed} but the pot is $${target}. They must match.` },
          { status: 400 },
        );
      }
    }
  }

  const rowUpdates: Record<string, unknown> = {};
  for (const key of ROW_FIELDS) {
    if (key in body) rowUpdates[key] = body[key];
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
  // resolved contest-derived values.
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
