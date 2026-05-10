import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// As of issue #124 Phase F, paid status lives on `contest_winners.paid`
// (the legacy `pickem_payouts` table is dropped). The endpoint shape is
// preserved so existing UI consumers keep working: GET returns
// `{user_id, paid_out, paid_out_at}[]` translated from contest_winners,
// and PUT writes back to contest_winners.

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

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("contest_winners")
    .select("user_id, paid, paid_at")
    .eq("contest_id", contestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const payouts = (data || []).map((r) => ({
    user_id: r.user_id,
    paid_out: !!r.paid,
    paid_out_at: r.paid_at,
  }));
  return NextResponse.json({ payouts });
}

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { contest_id, user_id, paid_out } = await request.json();

    if (!contest_id || !user_id) {
      return NextResponse.json({ error: "contest_id and user_id are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("contest_winners")
      .update({
        paid: !!paid_out,
        paid_at: paid_out ? new Date().toISOString() : null,
        paid_by: paid_out ? admin.id : null,
      })
      .eq("contest_id", contest_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update pickem payout error:", error);
    return NextResponse.json({ error: "Failed to update payout" }, { status: 500 });
  }
}
