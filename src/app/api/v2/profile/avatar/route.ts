import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { extForImage } from "@/lib/v2/orgs";

const BUCKET = "v2-avatars";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * POST /api/v2/profile/avatar — upload/replace the caller's avatar (multipart
 * `file`). Stored in the public v2-avatars bucket and written to
 * v2_profiles.avatar_url. Auth: bearer (native) or cookie (web).
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 5 MB" }, { status: 400 });
  }
  const ext = extForImage(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Use a PNG, JPG, WEBP, or GIF image" }, { status: 400 });
  }

  const admin = v2AdminClient();
  const path = `${userId}/avatar-${Date.now()}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  const avatarUrl = pub.publicUrl;

  const { error: updErr } = await admin
    .from("v2_profiles")
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", userId);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ avatar_url: avatarUrl });
}
