import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

/**
 * PATCH /api/v2/orgs/[id] — update an org's name, brand color, and/or store link.
 * Owner/admin only. Slug is intentionally NOT regenerated on rename (stable URLs).
 * Auth: bearer (native) or cookie (web) via v2GetUser.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, id))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: {
    name?: string;
    primary_color?: string;
    name_display?: string;
    store_url?: string | null;
    store_label?: string | null;
    store_enabled?: boolean;
    system_name?: string;
    member_noun?: string;
    member_noun_plural?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, string | null | boolean> = {};
  if (typeof body.name === "string") {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: "Name can't be empty" }, { status: 400 });
    if (name.length > 80) return NextResponse.json({ error: "Name is too long" }, { status: 400 });
    patch.name = name;
  }
  if (typeof body.primary_color === "string") {
    if (!/^#[0-9a-fA-F]{6}$/.test(body.primary_color)) {
      return NextResponse.json({ error: "Invalid color" }, { status: 400 });
    }
    patch.primary_color = body.primary_color;
  }
  if (body.name_display !== undefined) {
    if (body.name_display !== "nickname" && body.name_display !== "real") {
      return NextResponse.json({ error: "Invalid name display" }, { status: 400 });
    }
    patch.name_display = body.name_display;
  }
  if (body.store_url !== undefined) {
    const url = (body.store_url || "").trim();
    if (url && !/^https?:\/\/.+/i.test(url)) {
      return NextResponse.json({ error: "Store link must start with http(s)://" }, { status: 400 });
    }
    patch.store_url = url || null;
  }
  if (body.store_label !== undefined) {
    const label = (body.store_label || "").trim();
    patch.store_label = label ? label.slice(0, 60) : null;
  }
  if (typeof body.store_enabled === "boolean") {
    patch.store_enabled = body.store_enabled;
  }
  if (typeof body.system_name === "string") {
    const sys = body.system_name.trim();
    if (!sys) return NextResponse.json({ error: "System name can't be empty" }, { status: 400 });
    if (sys.length > 40) return NextResponse.json({ error: "System name is too long" }, { status: 400 });
    patch.system_name = sys;
  }
  if (typeof body.member_noun === "string") {
    const n = body.member_noun.trim();
    if (!n) return NextResponse.json({ error: "Member label can't be empty" }, { status: 400 });
    if (n.length > 30) return NextResponse.json({ error: "Member label is too long" }, { status: 400 });
    patch.member_noun = n;
  }
  if (typeof body.member_noun_plural === "string") {
    const n = body.member_noun_plural.trim();
    if (!n) return NextResponse.json({ error: "Member label can't be empty" }, { status: 400 });
    if (n.length > 30) return NextResponse.json({ error: "Member label is too long" }, { status: 400 });
    patch.member_noun_plural = n;
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }
  patch.updated_at = new Date().toISOString();

  const { error } = await admin.from("v2_organizations").update(patch).eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
