import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/**
 * PATCH  /api/v2/soundboard/tags/[id] — rename / recolor a tag (applies everywhere
 *   it's used, since mappings reference the id). manage_soundboard.
 * DELETE /api/v2/soundboard/tags/[id] — remove a tag; mappings cascade (sounds
 *   just lose the tag). manage_soundboard.
 */

async function operatorClientForTag(userId: string, tagId: string) {
  const admin = v2AdminClient();
  const { data: tag } = await admin
    .from("v2_sound_tags")
    .select("id, org_id")
    .eq("id", tagId)
    .maybeSingle();
  if (!tag) return { error: "Not found" as const, status: 404 };
  if (!(await hasPermission(admin, userId, tag.org_id, "manage_soundboard")))
    return { error: "Not allowed" as const, status: 403 };
  return { admin };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { name?: string; color?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const res = await operatorClientForTag(userId, id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "A tag name is required" }, { status: 400 });
    patch.name = name;
  }
  if (body.color !== undefined) patch.color = body.color ?? null;
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true });

  const { error } = await res.admin.from("v2_sound_tags").update(patch).eq("id", id);
  if (error) {
    if (error.code === "23505") return NextResponse.json({ error: "That tag already exists" }, { status: 409 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await operatorClientForTag(userId, id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });

  const { error } = await res.admin.from("v2_sound_tags").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
