import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * PUT    /api/v2/music/[id] — edit a song's metadata (title, lyrics, tagged user,
 *        artwork). DELETE /api/v2/music/[id] — remove the song (+ its v2-music
 *        storage files). Both require manage_music on the song's org.
 */
const BUCKET = "v2-music";

async function guard(
  request: Request,
  id: string,
): Promise<
  | { admin: SupabaseClient; userId: string; song: { id: string; org_id: string; mp3_url: string; art_url: string | null; art_thumb_url: string | null } }
  | { error: string; status: 401 | 403 | 404 }
> {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 };
  const admin = v2AdminClient();
  const { data: song } = await admin
    .from("v2_songs")
    .select("id, org_id, mp3_url, art_url, art_thumb_url")
    .eq("id", id)
    .maybeSingle();
  if (!song) return { error: "Not found", status: 404 };
  if (!(await hasPermission(admin, userId, song.org_id, "manage_music"))) {
    return { error: "Not allowed", status: 403 };
  }
  return { admin, userId, song };
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: {
    title?: string;
    lyrics?: string | null;
    tagged_user_id?: string | null;
    art_url?: string | null;
    art_thumb_url?: string | null;
    duration_seconds?: number | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) {
    const t = (body.title || "").trim();
    if (!t) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    patch.title = t;
  }
  if (body.lyrics !== undefined) patch.lyrics = (body.lyrics || "").trim() || null;
  if (body.tagged_user_id !== undefined) patch.tagged_user_id = body.tagged_user_id;
  if (body.art_url !== undefined) patch.art_url = body.art_url;
  if (body.art_thumb_url !== undefined) patch.art_thumb_url = body.art_thumb_url;
  if (body.duration_seconds !== undefined) patch.duration_seconds = body.duration_seconds;
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { error } = await g.admin.from("v2_songs").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // Remove owned v2-music files (best-effort; legacy-bucket URLs are left alone).
  const paths: string[] = [];
  for (const url of [g.song.mp3_url, g.song.art_url, g.song.art_thumb_url]) {
    if (url && url.includes(`/${BUCKET}/`)) paths.push(url.split(`/${BUCKET}/`)[1].split("?")[0]);
  }
  if (paths.length) await g.admin.storage.from(BUCKET).remove(paths).catch(() => {});

  const { error } = await g.admin.from("v2_songs").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
