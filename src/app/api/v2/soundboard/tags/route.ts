import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/**
 * The group's consistent soundboard tag vocabulary (one canonical spelling each).
 * POST /api/v2/soundboard/tags — create a tag { orgId, name, color? }.
 * PUT  /api/v2/soundboard/tags — reorder ({ orgId, order: [{id, sort_order}] }).
 * All manage_soundboard. (Reads come bundled in GET /api/v2/soundboard.)
 */

async function requireOperator(userId: string, orgId: string) {
  const admin = v2AdminClient();
  return (await hasPermission(admin, userId, orgId, "manage_soundboard")) ? admin : null;
}

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; name?: string; color?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "A tag name is required" }, { status: 400 });

  const admin = await requireOperator(userId, orgId);
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { data: last } = await admin
    .from("v2_sound_tags")
    .select("sort_order")
    .eq("org_id", orgId)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = (last?.sort_order ?? -1) + 1;

  const { data: created, error } = await admin
    .from("v2_sound_tags")
    .insert({ org_id: orgId, name, color: body.color ?? null, sort_order: sortOrder })
    .select("id, name, color, sort_order")
    .single();
  if (error) {
    // unique (org, lower(name)) violation → friendly message
    if (error.code === "23505") return NextResponse.json({ error: "That tag already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ tag: created });
}

export async function PUT(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; order?: { id: string; sort_order: number }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (!Array.isArray(body.order)) return NextResponse.json({ error: "order required" }, { status: 400 });

  const admin = await requireOperator(userId, orgId);
  if (!admin) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  await Promise.all(
    body.order.map((o) =>
      admin.from("v2_sound_tags").update({ sort_order: o.sort_order }).eq("id", o.id).eq("org_id", orgId),
    ),
  );
  return NextResponse.json({ ok: true });
}
