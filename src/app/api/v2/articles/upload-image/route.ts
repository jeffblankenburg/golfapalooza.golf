import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";

/** Article media allows GIF (fun) + video on top of the usual raster formats. */
function extForArticleMedia(mime: string): { ext: string; kind: "image" | "video" } | null {
  switch (mime) {
    case "image/png":
      return { ext: "png", kind: "image" };
    case "image/jpeg":
      return { ext: "jpg", kind: "image" };
    case "image/webp":
      return { ext: "webp", kind: "image" };
    case "image/gif":
      return { ext: "gif", kind: "image" };
    case "video/mp4":
      return { ext: "mp4", kind: "video" };
    case "video/webm":
      return { ext: "webm", kind: "video" };
    case "video/quicktime":
      return { ext: "mov", kind: "video" };
    default:
      return null;
  }
}

function kindForName(name: string): "image" | "video" {
  return /\.(mp4|webm|mov)$/i.test(name) ? "video" : "image";
}

/**
 * @swagger
 * /api/v2/articles/upload-image:
 *   get:
 *     tags: [Articles]
 *     summary: List the org's previously-uploaded article media (?orgId=)
 *   post:
 *     tags: [Articles]
 *     summary: Upload an article image or video (multipart `file` + `orgId`)
 *     description: >
 *       Stores media in the public v2-articles bucket and returns its public URL.
 *       Requires the manage_articles permission (or org owner/admin).
 */

const BUCKET = "v2-articles";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId") || "";
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_articles"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(orgId, { limit: 100, sortBy: { column: "created_at", order: "desc" } });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const media = (data || [])
    .filter((f) => f.name && !f.name.startsWith("."))
    .map((f) => ({
      name: f.name,
      url: admin.storage.from(BUCKET).getPublicUrl(`${orgId}/${f.name}`).data.publicUrl,
      kind: kindForName(f.name),
      created_at: f.created_at ?? null,
    }));
  return NextResponse.json({ media });
}

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

  const media = extForArticleMedia(file.type);
  if (!media) {
    return NextResponse.json({ error: "Use a PNG, JPG, WEBP, GIF, MP4, WEBM, or MOV file" }, { status: 400 });
  }
  const cap = media.kind === "video" ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES;
  if (file.size > cap) {
    return NextResponse.json(
      { error: `${media.kind === "video" ? "Video" : "Image"} is larger than ${cap / (1024 * 1024)} MB` },
      { status: 400 },
    );
  }

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_articles"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const path = `${orgId}/${Date.now()}-${file.size}.${media.ext}`;
  const { error: upErr } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: true });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  return NextResponse.json({ image_url: pub.publicUrl, url: pub.publicUrl, kind: media.kind });
}
