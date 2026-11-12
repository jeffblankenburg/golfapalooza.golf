import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgAdmin } from "@/lib/v2/orgs";

const BUCKET = "v2-threes-gifs";
const EXT: Record<string, string> = {
  "image/gif": "gif",
  "image/webp": "webp",
  "image/png": "png",
  "image/jpeg": "jpg",
  "video/mp4": "mp4",
};

/**
 * POST /api/v2/orgs/[id]/threes-gifs/upload-url { mime } — a signed URL to upload
 * a GIF straight to storage (bypassing the body limit). Admin-only.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: orgId } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const admin = v2AdminClient();
  if (!(await isOrgAdmin(admin, userId, orgId))) return NextResponse.json({ error: "Admins only" }, { status: 403 });

  let body: { mime?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const ext = EXT[body.mime || ""];
  if (!ext) return NextResponse.json({ error: "Use a GIF, WEBP, PNG, JPG, or MP4" }, { status: 400 });

  const path = `${orgId}/${Date.now()}-${userId}.${ext}`;
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    signedUrl: data.signedUrl,
    token: data.token,
    path,
    publicUrl: admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
  });
}
