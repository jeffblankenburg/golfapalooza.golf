import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import { SOUNDBOARD_BUCKET } from "@/lib/v2/soundboard-types";

/**
 * POST /api/v2/soundboard/upload-url { orgId, hasAudio?, audioExt?, hasImage? } —
 * signed URLs for a direct to-storage upload of a clip's audio and/or icon image,
 * bypassing the serverless body limit. `hasAudio` defaults true (a new clip);
 * pass false to upload only a replacement icon on edit. Gated by manage_soundboard.
 * Files land in the public v2-soundboard bucket, org-scoped.
 */

const ALLOWED_AUDIO_EXT = new Set(["mp3", "wav", "ogg", "webm", "m4a"]);

type Signed = { signedUrl: string; token: string; path: string; publicUrl: string };

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; hasAudio?: boolean; audioExt?: string; hasImage?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_soundboard"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const ts = Date.now();
  const wantAudio = body.hasAudio !== false;

  let audio: Signed | null = null;
  if (wantAudio) {
    const ext = (body.audioExt || "mp3").toLowerCase();
    if (!ALLOWED_AUDIO_EXT.has(ext)) {
      return NextResponse.json({ error: "Use an MP3, WAV, OGG, or WEBM clip" }, { status: 400 });
    }
    const audioPath = `${orgId}/audio/${ts}-${userId}.${ext}`;
    const { data, error } = await admin.storage
      .from(SOUNDBOARD_BUCKET)
      .createSignedUploadUrl(audioPath);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    audio = {
      signedUrl: data.signedUrl,
      token: data.token,
      path: audioPath,
      publicUrl: admin.storage.from(SOUNDBOARD_BUCKET).getPublicUrl(audioPath).data.publicUrl,
    };
  }

  let image: Signed | null = null;
  if (body.hasImage) {
    const imagePath = `${orgId}/images/${ts}-${userId}.png`;
    const { data, error } = await admin.storage
      .from(SOUNDBOARD_BUCKET)
      .createSignedUploadUrl(imagePath);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    image = {
      signedUrl: data.signedUrl,
      token: data.token,
      path: imagePath,
      publicUrl: admin.storage.from(SOUNDBOARD_BUCKET).getPublicUrl(imagePath).data.publicUrl,
    };
  }

  return NextResponse.json({ audio, image });
}
