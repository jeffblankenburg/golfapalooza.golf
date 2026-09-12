import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/** Article hero images allow GIF (fun) on top of the usual raster formats. */
function extForArticleImage(mime: string): string | null {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    default:
      return null;
  }
}

/**
 * @swagger
 * /api/v2/articles/upload-image:
 *   post:
 *     tags: [Articles]
 *     summary: Upload an article hero image (multipart `file` + `orgId`)
 *     description: >
 *       Stores the image in the public v2-articles bucket and returns its public
 *       URL. Requires the manage_articles permission (or org owner/admin).
 */

const BUCKET = "v2-articles";
const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let file: File | null = null;
  let orgId = "";
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
    orgId = String(form.get("orgId") || "");
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is larger than 10 MB" }, { status: 400 });
  }
  const ext = extForArticleImage(file.type);
  if (!ext) {
    return NextResponse.json({ error: "Use a PNG, JPG, WEBP, or GIF image" }, { status: 400 });
  }

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_articles"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const path = `${orgId}/${Date.now()}-${file.size}.${ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ image_url: pub.publicUrl });
}
