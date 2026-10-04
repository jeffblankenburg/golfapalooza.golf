import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isSystemAdmin } from "@/lib/v2/orgs";
import { SCORING_METRIC_SELECT, loadScoringMetrics, type ScoringMetric } from "@/lib/v2/scoring-metrics";

/** Platform scoring-metric catalog (#220). System admins only. Managed in /new/admin. */
async function requireSystemAdmin(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isSystemAdmin(admin, realUserId))) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  return { admin };
}

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "metric";

const VALUE_TYPES = new Set(["flag", "distance", "count"]);

export async function GET(request: Request) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const metrics = await loadScoringMetrics(gate.admin, { includeInactive: true });
  return NextResponse.json({ metrics });
}

export async function POST(request: Request) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;

  let body: { label?: string; description?: string; value_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const label = (body.label || "").trim();
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (label.length > 60) return NextResponse.json({ error: "Label is too long" }, { status: 400 });
  const value_type = VALUE_TYPES.has(body.value_type || "") ? body.value_type : "flag";

  // Unique key from the label (append a number if taken).
  const base = slugify(label);
  const { data: existing } = await admin.from("v2_scoring_metrics").select("key");
  const taken = new Set((existing || []).map((r) => r.key as string));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const { data: last } = await admin.from("v2_scoring_metrics").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from("v2_scoring_metrics")
    .insert({ key, label, description: (body.description || "").trim() || null, value_type, sort_order })
    .select(SCORING_METRIC_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ metric: data as ScoringMetric });
}
