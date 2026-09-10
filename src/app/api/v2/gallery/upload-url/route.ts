import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { GALLERY_BUCKET } from "@/lib/v2/gallery";

/**
 * POST /api/v2/gallery/upload-url { orgId, mediaType, fileName } — signed URL for
 * a direct-to-storage upload (bypasses the serverless body limit). Returns the
 * public URL, plus a thumbnail signed/public URL for videos.
 * Auth: bearer/cookie; org-membership gated.
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { orgId?: string; mediaType?: string; fileName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { orgId, mediaType, fileName } = body;
  if (!orgId || !mediaType || !fileName) {
    return NextResponse.json({ error: "orgId, mediaType, fileName required" }, { status: 400 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const ts = Date.now();
  const ext = fileName.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg");
  const filePath = `${orgId}/${ts}-${userId}.${ext}`;

  const { data, error } = await admin.storage.from(GALLERY_BUCKET).createSignedUploadUrl(filePath);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const publicUrl = admin.storage.from(GALLERY_BUCKET).getPublicUrl(filePath).data.publicUrl;

  let thumbSignedUrl: string | null = null;
  let thumbPublicUrl: string | null = null;
  if (mediaType === "video") {
    const thumbPath = `${orgId}/thumbs/${ts}-${userId}.jpg`;
    const { data: td } = await admin.storage.from(GALLERY_BUCKET).createSignedUploadUrl(thumbPath);
    if (td) {
      thumbSignedUrl = td.signedUrl;
      thumbPublicUrl = admin.storage.from(GALLERY_BUCKET).getPublicUrl(thumbPath).data.publicUrl;
    }
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    filePath,
    publicUrl,
    thumbSignedUrl,
    thumbPublicUrl,
  });
}
