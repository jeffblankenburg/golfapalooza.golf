import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// POST - Create a manual transaction
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { user_id, trip_id, type, description, amount, method, notes } = body;

    // Validate required fields
    if (!user_id || !trip_id || !type || !description || amount == null) {
      return NextResponse.json(
        { error: "user_id, trip_id, type, description, and amount are required" },
        { status: 400 }
      );
    }

    if (type !== "charge" && type !== "payment") {
      return NextResponse.json(
        { error: "type must be 'charge' or 'payment'" },
        { status: 400 }
      );
    }

    if (typeof amount !== "number" || amount <= 0) {
      return NextResponse.json(
        { error: "amount must be a number greater than 0" },
        { status: 400 }
      );
    }

    // Get the authenticated user's id for created_by
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: transaction, error } = await adminClient
      .from("financial_transactions")
      .insert({
        user_id,
        trip_id,
        type,
        source: "manual",
        option_id: null,
        description,
        amount,
        method: method || null,
        notes: notes || null,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(transaction, { status: 201 });
  } catch (error) {
    console.error("Create transaction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a manual transaction (cannot delete option-derived)
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Check that the transaction exists and is not option-derived
    const { data: existing, error: fetchError } = await adminClient
      .from("financial_transactions")
      .select("id, source")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    if (existing.source === "option") {
      return NextResponse.json(
        { error: "Cannot delete option-derived transactions. Manage these through the selection system." },
        { status: 403 }
      );
    }

    const { error: deleteError } = await adminClient
      .from("financial_transactions")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
