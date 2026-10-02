import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isSystemAdmin } from "@/lib/v2/orgs";
import { COST_CATEGORY_SELECT, loadCostCategories, type CostCategory } from "@/lib/v2/cost-categories";

/** Platform cost categories (#216). System admins only. Managed in /new/admin. */
async function requireSystemAdmin(request: Request) {
  const { realUserId } = await v2GetUser(request);
  if (!realUserId) return { error: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = v2AdminClient();
  if (!(await isSystemAdmin(admin, realUserId))) return { error: NextResponse.json({ error: "Not allowed" }, { status: 403 }) };
  return { admin };
}

const slugify = (s: string) =>
  s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || "category";

export async function GET(request: Request) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const categories = await loadCostCategories(gate.admin, { includeInactive: true });
  return NextResponse.json({ categories });
}

export async function POST(request: Request) {
  const gate = await requireSystemAdmin(request);
  if (gate.error) return gate.error;
  const { admin } = gate;

  let body: { label?: string; icon?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const label = (body.label || "").trim();
  if (!label) return NextResponse.json({ error: "Label is required" }, { status: 400 });
  if (label.length > 60) return NextResponse.json({ error: "Label is too long" }, { status: 400 });

  // Unique key from the label (append a number if taken).
  const base = slugify(label);
  const { data: existing } = await admin.from("v2_cost_categories").select("key");
  const taken = new Set((existing || []).map((r) => r.key as string));
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const { data: last } = await admin.from("v2_cost_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from("v2_cost_categories")
    .insert({ key, label, icon: (body.icon || "").trim() || null, sort_order })
    .select(COST_CATEGORY_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ category: data as CostCategory });
}
