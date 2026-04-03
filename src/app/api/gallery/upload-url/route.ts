import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * Generate a signed upload URL for direct-to-Supabase uploads.
 * This bypasses the Vercel body size limit by having the client
 * upload directly to Supabase Storage.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { tripId, mediaType, fileName } = await request.json();

  if (!mediaType || !fileName) {
    return NextResponse.json(
      { error: "mediaType and fileName are required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const timestamp = Date.now();
  const ext = fileName.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg");
  const pathPrefix = tripId || "shared";
  const filePath = `${pathPrefix}/${timestamp}-${effectiveUserId}.${ext}`;

  // Generate signed upload URL (valid for 10 minutes)
  const { data, error } = await client.storage
    .from("gallery-media")
    .createSignedUploadUrl(filePath);

  if (error) {
    return NextResponse.json(
      { error: `Failed to create upload URL: ${error.message}` },
      { status: 500 }
    );
  }

  // Also generate a thumbnail path if it's a video
  let thumbSignedUrl: string | null = null;
  let thumbPath: string | null = null;
  if (mediaType === "video") {
    thumbPath = `${pathPrefix}/thumbs/${timestamp}-${effectiveUserId}.jpg`;
    const { data: thumbData, error: thumbError } = await client.storage
      .from("gallery-media")
      .createSignedUploadUrl(thumbPath);

    if (!thumbError && thumbData) {
      thumbSignedUrl = thumbData.signedUrl;
    }
  }

  // Get the public URL for the file path
  const { data: urlData } = client.storage
    .from("gallery-media")
    .getPublicUrl(filePath);

  const thumbPublicUrl = thumbPath
    ? client.storage.from("gallery-media").getPublicUrl(thumbPath).data.publicUrl
    : null;

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    filePath,
    publicUrl: urlData.publicUrl,
    thumbSignedUrl,
    thumbPath,
    thumbPublicUrl,
  });
}
