import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Transactions for a specific user + financial contest or trip
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");
  const contestId = searchParams.get("financial_contest_id");
  const tripId = searchParams.get("trip_id");

  if (!userId || (!contestId && !tripId)) {
    return NextResponse.json(
      { error: "user_id and either financial_contest_id or trip_id are required" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();

    let query = adminClient
      .from("financial_transactions")
      .select(
        "id, type, source, description, amount, method, notes, created_at, created_by, creator:users!financial_transactions_created_by_fkey(display_name)"
      )
      .eq("user_id", userId);

    if (contestId) {
      query = query.eq("financial_contest_id", contestId);
    } else if (tripId) {
      query = query.eq("trip_id", tripId);
    }

    const { data: transactions, error } = await query.order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ transactions: transactions || [] });
  } catch (error) {
    console.error("Contest ledger error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
