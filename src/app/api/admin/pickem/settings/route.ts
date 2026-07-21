import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { getPickemEntryFee } from "@/lib/pickem/entry-fee";

// GET - Fetch settings for a contest. As of issue #124, payout structure
// lives on `contests.payout_splits`; as of issue #125, entry fee derives
// from `contests.buy_in_cost_item_id → cost_items.cost`. This endpoint
// translates everything back into the legacy shape PickemManager consumes.
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_pickem");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("contest_id");

  if (!contestId) {
    return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();
    const [settingsRes, contestRes, entryFeeRes] = await Promise.all([
      adminClient
        .from("pickem_settings")
        .select("is_open, contest_id")
        .eq("contest_id", contestId)
        .maybeSingle(),
      adminClient
        .from("contests")
        .select("payout_splits")
        .eq("id", contestId)
        .single(),
      getPickemEntryFee(adminClient, contestId),
    ]);

    if (settingsRes.error && settingsRes.error.code !== "PGRST116") {
      return NextResponse.json({ error: settingsRes.error.message }, { status: 500 });
    }
    if (contestRes.error) {
      return NextResponse.json({ error: contestRes.error.message }, { status: 500 });
    }

    type Split = { place: number; kind: string; amount?: number };
    const splits = (contestRes.data?.payout_splits || []) as Split[];
    const payout_json = splits
      .filter((s) => s.kind === "percentage")
      .map((s) => ({ place: Number(s.place), percentage: Number(s.amount ?? 0) }));

    return NextResponse.json({
      settings: {
        contest_id: contestId,
        entry_fee: entryFeeRes.entry_fee,
        cost_item_id: entryFeeRes.cost_item_id,
        is_open: settingsRes.data?.is_open ?? false,
        payout_json,
      },
    });
  } catch (error) {
    console.error("Get pickem settings error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// PUT - Upsert settings.
//   - `cost_item_id` (preferred, issue #125 Phase 4) goes to contests.buy_in_cost_item_id
//   - `is_open` goes to pickem_settings
//   - `payout_json` translates into `contests.payout_splits` (issue #124)
// The legacy `entry_fee` field on the body is ignored — clients should
// switch to sending `cost_item_id`. Field is preserved on pickem_settings
// only until Phase 5 drops the column.
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_pickem");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, cost_item_id, payout_json, is_open } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // pickem_settings retains is_open. entry_fee is no longer written here.
    const { error: settingsErr } = await adminClient
      .from("pickem_settings")
      .upsert(
        {
          contest_id,
          is_open: is_open ?? false,
        },
        { onConflict: "contest_id" },
      );
    if (settingsErr) {
      return NextResponse.json({ error: settingsErr.message }, { status: 500 });
    }

    // Entry fee lives on contests.buy_in_cost_item_id. `null` clears it
    // (entry fee becomes $0); a UUID points at the funding cost_items row.
    if (cost_item_id !== undefined) {
      const { error: feeErr } = await adminClient
        .from("contests")
        .update({ buy_in_cost_item_id: cost_item_id })
        .eq("id", contest_id);
      if (feeErr) {
        return NextResponse.json({ error: feeErr.message }, { status: 500 });
      }
    }

    if (Array.isArray(payout_json)) {
      type LegacyEntry = { place: number; percentage?: number };
      const splits = (payout_json as LegacyEntry[])
        .filter((p) => Number(p.percentage ?? 0) > 0)
        .map((p) => ({
          place: Number(p.place),
          kind: "percentage",
          amount: Number(p.percentage),
        }));

      const { error: contestErr } = await adminClient
        .from("contests")
        .update({ payout_splits: splits.length > 0 ? splits : null })
        .eq("id", contest_id);
      if (contestErr) {
        return NextResponse.json({ error: contestErr.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update pickem settings error:", error);
    return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
  }
}
