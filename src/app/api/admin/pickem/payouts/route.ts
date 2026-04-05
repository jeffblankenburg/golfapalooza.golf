import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// GET - Fetch payout statuses for a contest
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
    .from("pickem_payouts")
    .select("user_id, paid_out, paid_out_at")
    .eq("contest_id", contestId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ payouts: data || [] });
}

// PUT - Toggle payout status for a winner
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
      .from("pickem_payouts")
      .upsert(
        {
          contest_id,
          user_id,
          paid_out: !!paid_out,
          paid_out_at: paid_out ? new Date().toISOString() : null,
        },
        { onConflict: "contest_id,user_id" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update pickem payout error:", error);
    return NextResponse.json({ error: "Failed to update payout" }, { status: 500 });
  }
}
