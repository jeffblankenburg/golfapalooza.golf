import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// GET - Fetch settings for a contest. As of issue #124, payout structure
// lives on `contests.payout_splits`; this endpoint translates it into the
// legacy `{place, percentage}` shape PickemManager UI still uses.
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
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
    const [settingsRes, contestRes] = await Promise.all([
      adminClient
        .from("pickem_settings")
        .select("entry_fee, is_open, contest_id")
        .eq("contest_id", contestId)
        .maybeSingle(),
      adminClient
        .from("contests")
        .select("payout_splits")
        .eq("id", contestId)
        .single(),
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
        entry_fee: settingsRes.data?.entry_fee ?? 0,
        is_open: settingsRes.data?.is_open ?? false,
        payout_json,
      },
    });
  } catch (error) {
    console.error("Get pickem settings error:", error);
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// PUT - Upsert settings. `entry_fee` and `is_open` go to pickem_settings;
// `payout_json` translates into `contests.payout_splits` (issue #124).
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, entry_fee, payout_json, is_open } = await request.json();

    if (!contest_id) {
      return NextResponse.json({ error: "contest_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Pickem-specific settings (entry_fee, is_open) live on pickem_settings.
    // Payout structure goes to contests.payout_splits below (issue #124).
    const { error: settingsErr } = await adminClient
      .from("pickem_settings")
      .upsert(
        {
          contest_id,
          entry_fee: entry_fee || 0,
          is_open: is_open ?? false,
        },
        { onConflict: "contest_id" },
      );
    if (settingsErr) {
      return NextResponse.json({ error: settingsErr.message }, { status: 500 });
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
