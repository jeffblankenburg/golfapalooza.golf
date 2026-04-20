import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// Sources admins can set via this API. System sources (option,
// contest_entry) are written by their own subsystems; 'manual' and
// 'adjustment' remain legal so legacy flows / bookkeeping fixes still work.
const ADMIN_SOURCES = [
  "deposit",
  "withdrawal",
  "winnings",
  "credit",
  "expense",
  "manual",
  "adjustment",
] as const;
type AdminSource = (typeof ADMIN_SOURCES)[number];

const SOURCE_REQUIRED_TYPE: Partial<Record<AdminSource, "charge" | "payment">> = {
  deposit: "payment",
  winnings: "payment",
  credit: "payment",
  withdrawal: "charge",
  expense: "charge",
};

function validateSource(
  source: string | undefined | null,
  type: "charge" | "payment",
  financial_contest_id: string | null,
  trip_id: string | null
): { ok: true; source: AdminSource } | { ok: false; error: string } {
  const s = (source || "manual") as AdminSource;
  if (!ADMIN_SOURCES.includes(s)) {
    return { ok: false, error: `source must be one of ${ADMIN_SOURCES.join(", ")}` };
  }
  const required = SOURCE_REQUIRED_TYPE[s];
  if (required && required !== type) {
    return { ok: false, error: `source '${s}' requires type '${required}'` };
  }
  if (s === "winnings" && !financial_contest_id) {
    return { ok: false, error: "winnings require a financial_contest_id" };
  }
  if (s === "withdrawal" && (financial_contest_id || trip_id)) {
    return { ok: false, error: "withdrawals cannot be assigned to an event" };
  }
  return { ok: true, source: s };
}

// POST - Create a manual transaction
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { user_id, trip_id, type, description, amount, method, notes, financial_contest_id, source } = body;

    // Validate required fields
    if (!user_id || !type || !description || amount == null) {
      return NextResponse.json(
        { error: "user_id, type, description, and amount are required" },
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

    const sourceCheck = validateSource(source, type, financial_contest_id || null, trip_id || null);
    if (!sourceCheck.ok) {
      return NextResponse.json({ error: sourceCheck.error }, { status: 400 });
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
        trip_id: trip_id || null,
        type,
        source: sourceCheck.source,
        option_id: null,
        financial_contest_id: financial_contest_id || null,
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

// PUT - Update a transaction (manual: all fields; option-derived: amount only)
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, type, description, amount, method, notes, financial_contest_id } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get the authenticated user for audit trail
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: existing, error: fetchError } = await adminClient
      .from("financial_transactions")
      .select("id, source, type, description, amount, method, notes, financial_contest_id, trip_id")
      .eq("id", id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: "Transaction not found" }, { status: 404 });
    }

    const isOption = existing.source === "option";

    // Build update object from provided fields
    const updates: Record<string, unknown> = {};

    // Amount is editable for all transactions
    if (amount !== undefined) {
      if (typeof amount !== "number" || amount <= 0) {
        return NextResponse.json({ error: "amount must be a number greater than 0" }, { status: 400 });
      }
      updates.amount = amount;
    }

    // Other fields only editable on manual transactions
    if (!isOption) {
      if (type !== undefined) {
        if (type !== "charge" && type !== "payment") {
          return NextResponse.json({ error: "type must be 'charge' or 'payment'" }, { status: 400 });
        }
        updates.type = type;
      }
      if (description !== undefined) updates.description = description;
      if (method !== undefined) updates.method = method || null;
      if (notes !== undefined) updates.notes = notes || null;
      if (financial_contest_id !== undefined) updates.financial_contest_id = financial_contest_id || null;

      // Re-validate source against any changed type / financial_contest_id
      const nextType = (updates.type as "charge" | "payment") ?? existing.type;
      const nextContestId =
        "financial_contest_id" in updates
          ? (updates.financial_contest_id as string | null)
          : existing.financial_contest_id;
      const sourceCheck = validateSource(
        existing.source,
        nextType,
        nextContestId,
        existing.trip_id
      );
      if (!sourceCheck.ok) {
        return NextResponse.json({ error: sourceCheck.error }, { status: 400 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    // Log history before applying the update
    await adminClient.from("financial_transaction_history").insert({
      transaction_id: id,
      action: "edit",
      changed_by: user.id,
      previous_type: existing.type,
      previous_source: existing.source,
      previous_description: existing.description,
      previous_amount: existing.amount,
      previous_method: existing.method,
      previous_notes: existing.notes,
      previous_financial_contest_id: existing.financial_contest_id,
      previous_trip_id: existing.trip_id,
    });

    const { data: transaction, error } = await adminClient
      .from("financial_transactions")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(transaction);
  } catch (error) {
    console.error("Update transaction error:", error);
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

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    // Check that the transaction exists and is not option-derived
    const { data: existing, error: fetchError } = await adminClient
      .from("financial_transactions")
      .select("id, source, type, description, amount, method, notes, financial_contest_id, trip_id")
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

    if (existing.source === "contest_entry") {
      return NextResponse.json(
        { error: "Cannot delete contest entry transactions. Manage these through the contest participant system." },
        { status: 403 }
      );
    }

    // Log history before deleting
    await adminClient.from("financial_transaction_history").insert({
      transaction_id: id,
      action: "delete",
      changed_by: user.id,
      previous_type: existing.type,
      previous_source: existing.source,
      previous_description: existing.description,
      previous_amount: existing.amount,
      previous_method: existing.method,
      previous_notes: existing.notes,
      previous_financial_contest_id: existing.financial_contest_id,
      previous_trip_id: existing.trip_id,
    });

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
