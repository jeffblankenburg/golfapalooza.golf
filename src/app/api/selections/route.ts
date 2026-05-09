import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { syncContestEnrollment, syncCostItemContestEnrollment } from "@/lib/option-contest-sync";
import { getEffectiveUserId } from "@/lib/simulator";
import { computeOptionCosts } from "@/lib/cost-items/compute";

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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id is required" }, { status: 400 });

  const adminClient = createAdminClient();
  const { data, error } = await adminClient
    .from("user_option_selections")
    .select("*")
    .eq("trip_id", tripId)
    .eq("user_id", effectiveUserId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Build a map keyed by option_id
  const selections: Record<string, { id: string; value: unknown }> = {};
  for (const row of data || []) {
    selections[row.option_id] = { id: row.id, value: row.value };
  }

  return NextResponse.json({ selections });
}

export async function PUT(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { trip_id, option_id, value: rawValue } = await request.json();
  if (!trip_id || !option_id) {
    return NextResponse.json({ error: "trip_id and option_id are required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Deadline enforcement
  const { data: settings, error: settingsError } = await adminClient
    .from("trip_option_settings")
    .select("*")
    .eq("trip_id", trip_id)
    .maybeSingle();

  if (settingsError) return NextResponse.json({ error: settingsError.message }, { status: 500 });

  if (settings) {
    if (settings.is_open === false) {
      return NextResponse.json({ error: "Selections are closed" }, { status: 403 });
    }
    if (settings.selection_deadline && new Date() > new Date(settings.selection_deadline)) {
      return NextResponse.json({ error: "Selection deadline has passed" }, { status: 403 });
    }
  }

  // Load the option upfront so we can validate quantity-shaped values
  const { data: rawOption, error: optionError } = await adminClient
    .from("trip_options")
    .select("*")
    .eq("id", option_id)
    .single();
  if (optionError) return NextResponse.json({ error: optionError.message }, { status: 500 });

  // Replace stored cost with the value computed from linked cost_items so the
  // charge we record matches what the user saw on the options page.
  const [option] = await computeOptionCosts(adminClient, [rawOption]);

  let value = rawValue;
  if (option.option_type === "quantity" && rawValue != null) {
    const normalized = normalizeQuantityValue(rawValue, option);
    if (normalized.error) {
      return NextResponse.json({ error: normalized.error }, { status: 400 });
    }
    value = normalized.value;
  }

  // 1. Upsert or delete the selection
  if (value === null || value === undefined) {
    const { error: delError } = await adminClient
      .from("user_option_selections")
      .delete()
      .eq("user_id", effectiveUserId)
      .eq("option_id", option_id);
    if (delError) return NextResponse.json({ error: delError.message }, { status: 500 });
  } else {
    const { error: upsertError } = await adminClient
      .from("user_option_selections")
      .upsert(
        { trip_id, user_id: effectiveUserId, option_id, value },
        { onConflict: "user_id,option_id" }
      );
    if (upsertError) return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  // 2. Sync financial charges — always delete existing option-sourced charges first
  const { error: deleteChargeError } = await adminClient
    .from("financial_transactions")
    .delete()
    .eq("user_id", effectiveUserId)
    .eq("option_id", option_id)
    .eq("source", "option");
  if (deleteChargeError) return NextResponse.json({ error: deleteChargeError.message }, { status: 500 });

  // If value is null (deletion), cascade-clear dependent options, sync contest enrollment, and we're done
  if (value === null || value === undefined) {
    await Promise.all([
      syncContestEnrollment(adminClient, effectiveUserId, option, null),
      syncCostItemContestEnrollment(adminClient, effectiveUserId, option_id, null),
    ]);

    // Find options that depend on this one and clear their selections too
    const { data: dependents } = await adminClient
      .from("trip_options")
      .select("id, option_type, linked_contest_id, choices")
      .eq("depends_on_option_id", option_id);

    if (dependents && dependents.length > 0) {
      const depIds = dependents.map((d) => d.id);
      // Batch delete selections and charges for all dependents
      await Promise.all([
        adminClient
          .from("user_option_selections")
          .delete()
          .eq("user_id", effectiveUserId)
          .in("option_id", depIds),
        adminClient
          .from("financial_transactions")
          .delete()
          .eq("user_id", effectiveUserId)
          .in("option_id", depIds)
          .eq("source", "option"),
        // Unenroll from each dependent's contest (can't batch — each has different contest_id)
        ...dependents.flatMap((dep) => [
          syncContestEnrollment(adminClient, effectiveUserId, dep, null),
          syncCostItemContestEnrollment(adminClient, effectiveUserId, dep.id, null),
        ]),
      ]);
    }

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
        user_id: effectiveUserId,
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

  // 4. Sync contest enrollment (legacy linked_contest_id + new cost_item chain)
  await Promise.all([
    syncContestEnrollment(adminClient, effectiveUserId, option, value),
    syncCostItemContestEnrollment(adminClient, effectiveUserId, option_id, value),
  ]);

  return NextResponse.json({ success: true });
}
