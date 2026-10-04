import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isSystemAdmin } from "@/lib/v2/orgs";
import { SCORING_METRIC_SELECT, type ScoringMetric } from "@/lib/v2/scoring-metrics";

type Params = Promise<{ id: string }>;

async function requireSystemAdmin(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isSystemAdmin(admin, realUserId))) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  return { admin };
}

const EDITABLE = new Set(["label", "description", "value_type", "sort_order", "is_active"]);
const VALUE_TYPES = new Set(["flag", "distance", "count"]);

export async function PATCH(request: Request, { params }: { params: Params }) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (EDITABLE.has(k)) patch[k] = v;
  if ("label" in patch) {
    const l = String(patch.label || "").trim();
    if (!l) return NextResponse.json({ error: "Label can't be empty" }, { status: 400 });
    patch.label = l;
  }
  if ("description" in patch) patch.description = String(patch.description || "").trim() || null;
  if ("value_type" in patch && !VALUE_TYPES.has(String(patch.value_type))) return NextResponse.json({ error: "Invalid value type" }, { status: 400 });
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  patch.updated_at = new Date().toISOString();

  const { data, error } = await admin.from("v2_scoring_metrics").update(patch).eq("id", id).select(SCORING_METRIC_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metric: data as ScoringMetric });
}

/** Delete a metric — refused if any observation still uses it (deactivate instead). */
export async function DELETE(request: Request, { params }: { params: Params }) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;
  const { id } = await params;

  const { data: metric } = await admin.from("v2_scoring_metrics").select("key").eq("id", id).maybeSingle();
  if (!metric) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { count } = await admin.from("v2_contest_observations").select("id", { count: "exact", head: true }).eq("metric", metric.key);
  if (count && count > 0) {
    return NextResponse.json({ error: `In use by ${count} observation${count === 1 ? "" : "s"}. Deactivate it instead.` }, { status: 409 });
  }

  const { error } = await admin.from("v2_scoring_metrics").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
