import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Audit history for a specific transaction
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const transactionId = searchParams.get("transaction_id");

  if (!transactionId) {
    return NextResponse.json(
      { error: "transaction_id is required" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const { data: history, error } = await adminClient
      .from("financial_transaction_history")
      .select(
        "id, action, changed_at, previous_type, previous_source, previous_description, previous_amount, previous_method, previous_notes, changer:users!financial_transaction_history_changed_by_fkey(display_name)"
      )
      .eq("transaction_id", transactionId)
      .order("changed_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (history || []).map((h) => ({
      id: h.id,
      action: h.action,
      changed_at: h.changed_at,
      changed_by_name:
        (h.changer as unknown as { display_name: string } | null)
          ?.display_name ?? null,
      previous_type: h.previous_type,
      previous_source: h.previous_source,
      previous_description: h.previous_description,
      previous_amount: h.previous_amount ? Number(h.previous_amount) : null,
      previous_method: h.previous_method,
      previous_notes: h.previous_notes,
    }));

    return NextResponse.json({ history: formatted });
  } catch (error) {
    console.error("Transaction history error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
