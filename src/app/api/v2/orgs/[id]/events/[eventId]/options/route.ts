import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin, isOrgMember } from "@/lib/v2/orgs";
import { OPTION_SELECT, OPTION_TYPES, loadOptionPrices, normalizeChoices, type Option, type OptionType } from "@/lib/v2/options";

type Params = Promise<{ id: string; eventId: string }>;

/**
 * Event options (#216). GET returns each option with its DERIVED price (sum of its
 * linked cost_items) and the cost_items it bundles. Any member may read; admins write.
 */
export async function GET(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) return NextResponse.json({ error: "Not a member" }, { status: 403 });

  const { data: optRows } = await admin
    .from("v2_options").select(OPTION_SELECT).eq("event_id", eventId).order("sort_order");
  const options = (optRows || []) as Option[];
  const ids = options.map((o) => o.id);
  const prices = await loadOptionPrices(admin, ids);

  const { data: itemRows } = ids.length
    ? await admin.from("v2_cost_items").select("id, name, amount_cents, source_type, source_id, linked_option_id").in("linked_option_id", ids)
    : { data: [] as { id: string; name: string; amount_cents: number; source_type: string; source_id: string | null; linked_option_id: string | null }[] };
  const itemsByOption = new Map<string, typeof itemRows>();
  for (const it of itemRows || []) {
    const oid = it.linked_option_id as string;
    (itemsByOption.get(oid) || itemsByOption.set(oid, []).get(oid)!).push(it);
  }

  return NextResponse.json({
    options: options.map((o) => ({ ...o, price_cents: prices.get(o.id) || 0, items: itemsByOption.get(o.id) || [] })),
  });
}

/** Create an option (#216). Admins only. */
export async function POST(request: Request, { params }: { params: Params }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: orgId, eventId } = await params;

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: {
    name?: string; description?: string; option_type?: string; group_id?: string | null;
    choices?: unknown; is_required?: boolean; max_total?: number | null; icon?: string; depends_on_option_id?: string | null;
    allow_none?: boolean; none_label?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name is required" }, { status: 400 });
  if (name.length > 120) return NextResponse.json({ error: "Name is too long" }, { status: 400 });
  const type: OptionType = OPTION_TYPES.some((t) => t.type === body.option_type) ? (body.option_type as OptionType) : "checkbox";

  const { data: last } = await admin
    .from("v2_options").select("sort_order").eq("event_id", eventId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const sort_order = (last?.sort_order ?? -1) + 1;

  const { data, error } = await admin
    .from("v2_options")
    .insert({
      org_id: orgId, event_id: eventId, name, description: (body.description || "").trim() || null,
      option_type: type, group_id: body.group_id || null, choices: normalizeChoices(body.choices, type),
      is_required: !!body.is_required, max_total: type === "quantity" && typeof body.max_total === "number" ? body.max_total : null,
      icon: (body.icon || "").trim() || null, depends_on_option_id: body.depends_on_option_id || null,
      allow_none: !!body.allow_none, none_label: (body.none_label || "").trim() || null,
      sort_order, created_by: userId,
    })
    .select(OPTION_SELECT).single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ option: { ...(data as Option), price_cents: 0, items: [] } });
}
