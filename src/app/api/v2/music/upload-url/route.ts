import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/**
 * POST /api/v2/music/upload-url { orgId, hasArt? } — signed URLs for a direct
 * to-storage upload of a track's MP3 (+ optional album art), bypassing the
 * serverless body limit. Returns each file's signed upload URL + final public
 * URL. Gated by manage_music. Files land in the public v2-music bucket, org-scoped.
 */
const BUCKET = "v2-music";

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; hasArt?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_music"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const ts = Date.now();
  const audioPath = `${orgId}/audio/${ts}-${userId}.mp3`;
  const { data: audioData, error: audioErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(audioPath);
  if (audioErr) return NextResponse.json({ error: audioErr.message }, { status: 500 });

  const mp3 = {
    signedUrl: audioData.signedUrl,
    token: audioData.token,
    path: audioPath,
    publicUrl: admin.storage.from(BUCKET).getPublicUrl(audioPath).data.publicUrl,
  };

  let art: { signedUrl: string; token: string; path: string; publicUrl: string } | null = null;
  if (body.hasArt) {
    const artPath = `${orgId}/art/${ts}-${userId}.jpg`;
    const { data: artData, error: artErr } = await admin.storage.from(BUCKET).createSignedUploadUrl(artPath);
    if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 });
    art = {
      signedUrl: artData.signedUrl,
      token: artData.token,
      path: artPath,
      publicUrl: admin.storage.from(BUCKET).getPublicUrl(artPath).data.publicUrl,
    };
  }

  return NextResponse.json({ mp3, art });
}
