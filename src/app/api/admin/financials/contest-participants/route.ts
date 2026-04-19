import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - List participants for a financial contest
export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const contestId = searchParams.get("financial_contest_id");

  if (!contestId) {
    return NextResponse.json(
      { error: "financial_contest_id is required" },
      { status: 400 }
    );
  }

  try {
    const adminClient = createAdminClient();

    const { data: participants, error } = await adminClient
      .from("financial_contest_participants")
      .select(
        "id, user_id, quantity, created_at, user:users!financial_contest_participants_user_id_fkey(id, display_name, full_name, avatar_url)"
      )
      .eq("financial_contest_id", contestId)
      .order("created_at");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ participants: participants || [] });
  } catch (error) {
    console.error("List contest participants error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// POST - Add participant(s) to a financial contest
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { financial_contest_id, user_ids, quantity: rawQty } = body;
    const quantity = Math.max(1, Math.floor(Number(rawQty) || 1));

    if (!financial_contest_id || !user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json(
        { error: "financial_contest_id and user_ids (array) are required" },
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

    // Get the contest to check entry_fee
    const { data: contest, error: contestError } = await adminClient
      .from("financial_contests")
      .select("id, name, entry_fee")
      .eq("id", financial_contest_id)
      .single();

    if (contestError || !contest) {
      return NextResponse.json({ error: "Contest not found" }, { status: 404 });
    }

    // Get existing participants to skip duplicates
    const { data: existing } = await adminClient
      .from("financial_contest_participants")
      .select("user_id")
      .eq("financial_contest_id", financial_contest_id);

    const existingIds = new Set((existing || []).map((e) => e.user_id));
    const newUserIds = user_ids.filter((id: string) => !existingIds.has(id));

    if (newUserIds.length === 0) {
      return NextResponse.json({ added: 0 });
    }

    // Batch insert participants
    const participantRows = newUserIds.map((uid: string) => ({
      financial_contest_id,
      user_id: uid,
      quantity,
    }));

    const { error: insertError } = await adminClient
      .from("financial_contest_participants")
      .insert(participantRows);

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Create entry fee charges if entry_fee > 0
    const entryFee = Number(contest.entry_fee || 0);
    if (entryFee > 0) {
      const totalCharge = entryFee * quantity;
      const desc = quantity > 1 ? `Entry fee (x${quantity})` : "Entry fee";
      const chargeRows = newUserIds.map((uid: string) => ({
        user_id: uid,
        financial_contest_id,
        type: "charge",
        source: "contest_entry",
        description: desc,
        amount: totalCharge,
        created_by: user.id,
      }));

      const { error: chargeError } = await adminClient
        .from("financial_transactions")
        .insert(chargeRows);

      if (chargeError) {
        console.error("Failed to create entry fee charges:", chargeError);
      }
    }

    return NextResponse.json({ added: newUserIds.length }, { status: 201 });
  } catch (error) {
    console.error("Add contest participants error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// PUT - Update participant quantity
export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { financial_contest_id, user_id, quantity: rawQty } = body;
    const quantity = Math.max(1, Math.floor(Number(rawQty) || 1));

    if (!financial_contest_id || !user_id) {
      return NextResponse.json(
        { error: "financial_contest_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Update participant quantity
    const { error: updateError } = await adminClient
      .from("financial_contest_participants")
      .update({ quantity })
      .eq("financial_contest_id", financial_contest_id)
      .eq("user_id", user_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Update the entry fee charge amount
    const { data: contest } = await adminClient
      .from("financial_contests")
      .select("entry_fee")
      .eq("id", financial_contest_id)
      .single();

    const entryFee = Number(contest?.entry_fee || 0);
    if (entryFee > 0) {
      const totalCharge = entryFee * quantity;
      const desc = quantity > 1 ? `Entry fee (x${quantity})` : "Entry fee";
      await adminClient
        .from("financial_transactions")
        .update({ amount: totalCharge, description: desc })
        .eq("user_id", user_id)
        .eq("financial_contest_id", financial_contest_id)
        .eq("source", "contest_entry")
        .eq("type", "charge");
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update contest participant error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// DELETE - Remove a participant from a financial contest
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { financial_contest_id, user_id } = body;

    if (!financial_contest_id || !user_id) {
      return NextResponse.json(
        { error: "financial_contest_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Delete the entry fee charge
    await adminClient
      .from("financial_transactions")
      .delete()
      .eq("user_id", user_id)
      .eq("financial_contest_id", financial_contest_id)
      .eq("source", "contest_entry")
      .eq("type", "charge");

    // Delete the participant
    const { error } = await adminClient
      .from("financial_contest_participants")
      .delete()
      .eq("financial_contest_id", financial_contest_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove contest participant error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
