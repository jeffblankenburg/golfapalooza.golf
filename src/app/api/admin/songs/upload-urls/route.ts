import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

/**
 * Generate signed upload URLs so the client can upload files
 * directly to Supabase Storage, bypassing the API body size limit.
 */
export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_music");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized — you need the manage_music permission" }, { status: 401 });
  }

  const { hasArt, hasThumb } = await request.json();
  const adminClient = createAdminClient();
  const songId = crypto.randomUUID();
  const timestamp = Date.now();

  const mp3Path = `audio/${timestamp}-${songId}.mp3`;
  const { data: mp3Signed, error: mp3Err } = await adminClient.storage
    .from("songs")
    .createSignedUploadUrl(mp3Path);

  if (mp3Err || !mp3Signed) {
    return NextResponse.json({ error: `Failed to create MP3 upload URL: ${mp3Err?.message}` }, { status: 500 });
  }

  let artSigned: { signedUrl: string; path: string } | null = null;
  let thumbSigned: { signedUrl: string; path: string } | null = null;

  if (hasArt) {
    const artPath = `art/${timestamp}-${songId}.jpg`;
    const { data, error } = await adminClient.storage
      .from("songs")
      .createSignedUploadUrl(artPath);
    if (!error && data) artSigned = data;
  }

  if (hasThumb) {
    const thumbPath = `art/${timestamp}-${songId}-thumb.jpg`;
    const { data, error } = await adminClient.storage
      .from("songs")
      .createSignedUploadUrl(thumbPath);
    if (!error && data) thumbSigned = data;
  }

  // Get public URLs
  const { data: mp3Public } = adminClient.storage.from("songs").getPublicUrl(mp3Path);
  const artPublicUrl = artSigned ? adminClient.storage.from("songs").getPublicUrl(artSigned.path).data.publicUrl : null;
  const thumbPublicUrl = thumbSigned ? adminClient.storage.from("songs").getPublicUrl(thumbSigned.path).data.publicUrl : null;

  return NextResponse.json({
    songId,
    mp3: { signedUrl: mp3Signed.signedUrl, path: mp3Signed.path, publicUrl: mp3Public.publicUrl },
    art: artSigned ? { signedUrl: artSigned.signedUrl, path: artSigned.path, publicUrl: artPublicUrl } : null,
    thumb: thumbSigned ? { signedUrl: thumbSigned.signedUrl, path: thumbSigned.path, publicUrl: thumbPublicUrl } : null,
  });
}
