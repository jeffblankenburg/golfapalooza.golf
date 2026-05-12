import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { getEffectiveUserId } from "@/lib/simulator";

const IMAGE_EXT_RE = /\.(jpg|jpeg|png|gif|webp)$/i;
const VIDEO_EXT_RE = /\.(mp4|webm|mov)$/i;

type Kind = "image" | "video";

function classifyByExt(name: string): Kind | null {
  if (IMAGE_EXT_RE.test(name)) return "image";
  if (VIDEO_EXT_RE.test(name)) return "video";
  return null;
}

// GET - List previously uploaded article images + videos
export async function GET() {
  const user = await checkPermissionAccess("manage_articles");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();

  // List files in articles/ and any subfolders (old uploads used articles/{tripId}/)
  const { data: topLevel } = await admin.storage
    .from("gallery-media")
    .list("articles", { limit: 200, sortBy: { column: "created_at", order: "desc" } });

  const allFiles: { path: string; created_at: string; kind: Kind }[] = [];
  const subfolders: string[] = [];

  for (const item of topLevel || []) {
    if (!item.name) continue;
    const kind = classifyByExt(item.name);
    if (kind) {
      allFiles.push({ path: `articles/${item.name}`, created_at: item.created_at || "", kind });
    } else if (!item.name.includes(".")) {
      // Likely a subfolder (no extension)
      subfolders.push(item.name);
    }
  }

  // Check subfolders for old uploads
  if (subfolders.length > 0) {
    const subResults = await Promise.all(
      subfolders.map((folder) =>
        admin.storage.from("gallery-media").list(`articles/${folder}`, { limit: 100 })
      )
    );
    subResults.forEach((result, i) => {
      for (const file of result.data || []) {
        if (!file.name) continue;
        const kind = classifyByExt(file.name);
        if (kind) {
          allFiles.push({
            path: `articles/${subfolders[i]}/${file.name}`,
            created_at: file.created_at || "",
            kind,
          });
        }
      }
    });
  }

  // Sort newest first
  allFiles.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));

  const images = allFiles.map((f) => {
    const { data: urlData } = admin.storage
      .from("gallery-media")
      .getPublicUrl(f.path);
    return { name: f.path, url: urlData.publicUrl, created_at: f.created_at, kind: f.kind };
  });

  return NextResponse.json({ images });
}

export async function POST(request: NextRequest) {
  const user = await checkPermissionAccess("manage_articles");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    const isVideo = (file.type || "").startsWith("video/");
    // 10MB for images, 100MB for videos (client compresses to ~720p
    // before upload via compressVideo, so a typical 30s clip is well
    // under this cap).
    const maxBytes = isVideo ? 100 * 1024 * 1024 : 10 * 1024 * 1024;
    if (file.size > maxBytes) {
      const maxMB = Math.round(maxBytes / 1024 / 1024);
      const kindLabel = isVideo ? "Video" : "Image";
      return NextResponse.json(
        { error: `${kindLabel} must be under ${maxMB}MB` },
        { status: 400 },
      );
    }

    const effectiveUserId = await getEffectiveUserId(user.id);
    const admin = createAdminClient();

    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || (isVideo ? "mp4" : "jpg");
    const filePath = `articles/${timestamp}-${effectiveUserId}.${ext}`;
    const fallbackType = isVideo ? "video/mp4" : "image/jpeg";

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("gallery-media")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || fallbackType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage
      .from("gallery-media")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl, kind: isVideo ? "video" : "image" });
  } catch (err) {
    console.error("Article image upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
