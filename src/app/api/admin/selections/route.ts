import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkPermissionAccess } from "@/lib/permissions-server";

export async function GET(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_option_selections")
    .select("*")
    .eq("trip_id", tripId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build a map keyed by user_id then option_id
  const selections: Record<string, Record<string, { id: string; value: unknown }>> = {};
  for (const row of data || []) {
    if (!selections[row.user_id]) selections[row.user_id] = {};
    selections[row.user_id][row.option_id] = { id: row.id, value: row.value };
  }

  return NextResponse.json({ selections });
}

export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { trip_id, user_id, option_id, value } = await request.json();
  if (!trip_id || !user_id || !option_id) {
    return NextResponse.json({ error: "trip_id, user_id, and option_id are required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Get the authenticated user's id for created_by
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 1. Upsert or delete the selection
  if (value === null || value === undefined) {
    // Delete the selection
    const { error: delError } = await adminClient
      .from("user_option_selections")
      .delete()
      .eq("user_id", user_id)
      .eq("option_id", option_id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  } else {
    // Upsert the selection
    const { error: upsertError } = await adminClient
      .from("user_option_selections")
      .upsert(
        { trip_id, user_id, option_id, value },
        { onConflict: "user_id,option_id" }
      );
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // 2. Sync financial charges — always delete existing option-sourced charges first
  const { error: deleteChargeError } = await adminClient
    .from("financial_transactions")
    .delete()
    .eq("user_id", user_id)
    .eq("option_id", option_id)
    .eq("source", "option");
  if (deleteChargeError) return NextResponse.json({ error: deleteChargeError.message }, { status: 500 });

  // If value is null (deletion), we're done — no new charge to create
  if (value === null || value === undefined) {
    return NextResponse.json({ success: true });
  }

  // Look up the trip_options row to determine cost
  const { data: option, error: optionError } = await adminClient
    .from("trip_options")
    .select("*")
    .eq("id", option_id)
    .single();
  if (optionError) return NextResponse.json({ error: optionError.message }, { status: 500 });

  let chargeAmount: number | null = null;
  let description = option.name;

  if (option.option_type === "checkbox") {
    if (value === true) {
      chargeAmount = option.cost ? Number(option.cost) : null;
    }
  } else if (option.option_type === "select") {
    const choices = (option.choices || []) as Array<{ label: string; value: string; cost?: number }>;
    const matched = choices.find((c) => c.value === value);
    if (matched && matched.cost) {
      chargeAmount = Number(matched.cost);
      description = `${option.name}: ${matched.label}`;
    }
  } else if (option.option_type === "multi_select") {
    const choices = (option.choices || []) as Array<{ label: string; value: string; cost?: number }>;
    const selectedValues = Array.isArray(value) ? value : [];
    let total = 0;
    const labels: string[] = [];
    for (const val of selectedValues) {
      const matched = choices.find((c) => c.value === val);
      if (matched && matched.cost) {
        total += Number(matched.cost);
        labels.push(matched.label);
      }
    }
    if (total > 0) {
      chargeAmount = total;
      description = `${option.name}: ${labels.join(", ")}`;
    }
  }
  // text and number types: no charge

  // Create the charge if there's a cost
  if (chargeAmount && chargeAmount > 0) {
    const { error: chargeError } = await adminClient
      .from("financial_transactions")
      .insert({
        user_id,
        trip_id,
        type: "charge",
        source: "option",
        option_id,
        description,
        amount: chargeAmount,
        created_by: user.id,
      });
    if (chargeError) return NextResponse.json({ error: chargeError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
