import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

/**
 * PATCH /api/v2/orgs/[id] — update an org's name and/or brand color.
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

  let body: { name?: string; primary_color?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, string> = {};
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
