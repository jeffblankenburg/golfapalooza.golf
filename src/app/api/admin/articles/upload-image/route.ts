import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { getEffectiveUserId } from "@/lib/simulator";

// GET - List previously uploaded article images
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

  const allFiles: { path: string; created_at: string }[] = [];
  const subfolders: string[] = [];

  for (const item of topLevel || []) {
    if (!item.name) continue;
    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(item.name)) {
      allFiles.push({ path: `articles/${item.name}`, created_at: item.created_at || "" });
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
        if (file.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name)) {
          allFiles.push({ path: `articles/${subfolders[i]}/${file.name}`, created_at: file.created_at || "" });
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
    return { name: f.path, url: urlData.publicUrl, created_at: f.created_at };
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

    // 10MB limit for article images
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
    }

    const effectiveUserId = await getEffectiveUserId(user.id);
    const admin = createAdminClient();

    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `articles/${timestamp}-${effectiveUserId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("gallery-media")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage
      .from("gallery-media")
      .getPublicUrl(filePath);

    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("Article image upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
