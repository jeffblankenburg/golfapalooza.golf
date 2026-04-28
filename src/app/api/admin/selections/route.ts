import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { syncContestEnrollment } from "@/lib/option-contest-sync";

function normalizeQuantityValue(
  raw: unknown,
  option: { choices?: Array<{ value: string }> | null; max_total?: number | null }
): { value: Record<string, number> | null; error?: string } {
  if (raw === null || raw === undefined) return { value: null };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { value: null, error: "quantity value must be an object of {choice: count}" };
  }
  const choiceValues = new Set((option.choices || []).map((c) => c.value));
  const out: Record<string, number> = {};
  let total = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!choiceValues.has(k)) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) {
      return { value: null, error: `invalid quantity for ${k}` };
    }
    const intN = Math.floor(n);
    if (intN > 0) {
      out[k] = intN;
      total += intN;
    }
  }
  if (option.max_total != null && total > option.max_total) {
    return { value: null, error: `total quantity exceeds the limit of ${option.max_total}` };
  }
  // Preserve {} as the "explicitly chose zero" marker; client sends null
  // when the user truly wants to clear the row.
  return { value: out };
}

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

  const { trip_id, user_id, option_id, value: rawValue } = await request.json();
  if (!trip_id || !user_id || !option_id) {
    return NextResponse.json({ error: "trip_id, user_id, and option_id are required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Get the authenticated user's id for created_by
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Load option early so we can validate quantity-shaped values
  const { data: optionPre, error: optionPreError } = await adminClient
    .from("trip_options")
    .select("*")
    .eq("id", option_id)
    .single();
  if (optionPreError) return NextResponse.json({ error: optionPreError.message }, { status: 500 });

  let value = rawValue;
  if (optionPre.option_type === "quantity" && rawValue != null) {
    const normalized = normalizeQuantityValue(rawValue, optionPre);
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    value = normalized.value;
  }

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

  const option = optionPre;

  // If value is null (deletion), sync contest enrollment (unenroll) and we're done
  if (value === null || value === undefined) {
    await syncContestEnrollment(adminClient, user_id, option, null);
    return NextResponse.json({ success: true });
  }

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

  // 3. Sync contest enrollment
  await syncContestEnrollment(adminClient, user_id, option, value);

  return NextResponse.json({ success: true });
}

// Wipes every user's selections for a trip plus the option-sourced
// financial charges. Stale contest_participants will resync as users
// re-answer their options. Intended for resetting test data.
export async function DELETE(request: Request) {
  const admin = await checkPermissionAccess("manage_finances");
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id is required" }, { status: 400 });

  const adminClient = createAdminClient();

  const [selResult, txResult] = await Promise.all([
    adminClient.from("user_option_selections").delete().eq("trip_id", tripId),
    adminClient
      .from("financial_transactions")
      .delete()
      .eq("trip_id", tripId)
      .eq("source", "option"),
  ]);

  if (selResult.error) return NextResponse.json({ error: selResult.error.message }, { status: 500 });
  if (txResult.error) return NextResponse.json({ error: txResult.error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
