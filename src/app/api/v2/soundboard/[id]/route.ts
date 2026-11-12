import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import { SOUNDBOARD_BUCKET } from "@/lib/v2/soundboard-types";

/**
 * PATCH /api/v2/soundboard/[id] — edit a sound (name, emoji, image, tag set).
 * DELETE /api/v2/soundboard/[id] — hard-delete a sound: remove its storage
 *   objects, then the row (tag mappings + plays cascade). Both manage_soundboard.
 */

async function operatorClientForSound(userId: string, soundId: string) {
  const admin = v2AdminClient();
  const { data: sound } = await admin
    .from("v2_sounds")
    .select("id, org_id, audio_path, image_path")
    .eq("id", soundId)
    .maybeSingle();
  if (!sound) return { error: "Not found" as const, status: 404 };
  if (!(await hasPermission(admin, userId, sound.org_id, "manage_soundboard")))
    return { error: "Not allowed" as const, status: 403 };
  return { admin, sound };
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    name?: string;
    emoji?: string | null;
    image_url?: string | null;
    image_path?: string | null;
    tagIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const res = await operatorClientForSound(userId, id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const { admin, sound } = res;

  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = (body.name || "").trim();
    if (!name) return NextResponse.json({ error: "A name is required" }, { status: 400 });
    patch.name = name;
  }
  if (body.emoji !== undefined) patch.emoji = (body.emoji || "").trim() || null;
  if (body.image_url !== undefined) patch.image_url = body.image_url ?? null;
  if (body.image_path !== undefined) patch.image_path = body.image_path ?? null;

  if (Object.keys(patch).length) {
    const { error } = await admin.from("v2_sounds").update(patch).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (Array.isArray(body.tagIds)) {
    const tagIds = Array.from(new Set(body.tagIds));
    await admin.from("v2_sound_tag_map").delete().eq("sound_id", id);
    if (tagIds.length) {
      await admin
        .from("v2_sound_tag_map")
        .insert(tagIds.map((tag_id) => ({ sound_id: id, tag_id, org_id: sound.org_id })));
    }
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const res = await operatorClientForSound(userId, id);
  if ("error" in res) return NextResponse.json({ error: res.error }, { status: res.status });
  const { admin, sound } = res;

  const paths = [sound.audio_path, sound.image_path].filter(Boolean) as string[];
  if (paths.length) {
    await admin.storage.from(SOUNDBOARD_BUCKET).remove(paths).catch(() => {});
  }

  const { error } = await admin.from("v2_sounds").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
