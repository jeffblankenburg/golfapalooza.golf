import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - List all financial contests
export async function GET() {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const adminClient = createAdminClient();

    const { data: contests, error } = await adminClient
      .from("financial_contests")
      .select("id, name, description, contest_date, entry_fee, created_by, created_at, financial_contest_participants(count)")
      .order("contest_date", { ascending: false, nullsFirst: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const formatted = (contests || []).map((c) => ({
      ...c,
      entry_fee: Number(c.entry_fee || 0),
      participant_count: Array.isArray(c.financial_contest_participants)
        ? (c.financial_contest_participants[0] as unknown as { count: number })?.count || 0
        : 0,
      financial_contest_participants: undefined,
    }));
    return NextResponse.json({ contests: formatted });
  } catch (error) {
    console.error("List financial contests error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Create a financial contest
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { name, description, contest_date, entry_fee } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminClient = createAdminClient();

    const { data: contest, error } = await adminClient
      .from("financial_contests")
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        contest_date: contest_date || null,
        entry_fee: entry_fee != null ? Number(entry_fee) : 0,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(contest, { status: 201 });
  } catch (error) {
    console.error("Create financial contest error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update a financial contest
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, name, description, contest_date, entry_fee } = body;

    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const updates: Record<string, unknown> = {};
    if (name !== undefined) {
      if (!name.trim()) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      updates.name = name.trim();
    }
    if (description !== undefined) updates.description = description?.trim() || null;
    if (contest_date !== undefined) updates.contest_date = contest_date || null;
    if (entry_fee !== undefined) updates.entry_fee = Number(entry_fee) || 0;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: contest, error } = await adminClient
      .from("financial_contests")
      .update(updates)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // If entry_fee changed, update all existing contest_entry charges
    if (entry_fee !== undefined) {
      const newFee = Number(entry_fee) || 0;
      if (newFee > 0) {
        await adminClient
          .from("financial_transactions")
          .update({ amount: newFee })
          .eq("financial_contest_id", id)
          .eq("source", "contest_entry")
          .eq("type", "charge");
      } else {
        // Fee set to 0 — delete all entry charges
        await adminClient
          .from("financial_transactions")
          .delete()
          .eq("financial_contest_id", id)
          .eq("source", "contest_entry")
          .eq("type", "charge");
      }
    }

    return NextResponse.json(contest);
  } catch (error) {
    console.error("Update financial contest error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Delete a financial contest
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

    // Delete auto-generated entry fee charges first
    await adminClient
      .from("financial_transactions")
      .delete()
      .eq("financial_contest_id", id)
      .eq("source", "contest_entry");

    const { error } = await adminClient
      .from("financial_contests")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete financial contest error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
