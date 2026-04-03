import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Full transaction history for a single user
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("user_id");

  if (!userId) {
    return NextResponse.json({ error: "user_id is required" }, { status: 400 });
  }

  try {
    const adminClient = createAdminClient();

    const { data: transactions, error } = await adminClient
      .from("financial_transactions")
      .select(
        "id, trip_id, type, source, description, amount, method, notes, created_by, created_at, trip:trip_settings!financial_transactions_trip_id_fkey(trip_name), creator:users!financial_transactions_created_by_fkey(display_name)"
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (transactions || []).map((t) => ({
      id: t.id,
      trip_id: t.trip_id,
      trip_name: (t.trip as unknown as { trip_name: string } | null)?.trip_name ?? null,
      type: t.type,
      source: t.source,
      description: t.description,
      amount: Number(t.amount),
      method: t.method,
      notes: t.notes,
      created_by: t.created_by,
      created_by_name: (t.creator as unknown as { display_name: string } | null)?.display_name ?? null,
      created_at: t.created_at,
    }));

    return NextResponse.json({ transactions: formatted });
  } catch (error) {
    console.error("Financial ledger error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
