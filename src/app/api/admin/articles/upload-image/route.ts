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
  const { data, error } = await admin.storage
    .from("gallery-media")
    .list("articles", { limit: 100, sortBy: { column: "created_at", order: "desc" } });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const images = (data || [])
    .filter((f) => f.name && /\.(jpg|jpeg|png|gif|webp)$/i.test(f.name))
    .map((f) => {
      const { data: urlData } = admin.storage
        .from("gallery-media")
        .getPublicUrl(`articles/${f.name}`);
      return { name: f.name, url: urlData.publicUrl, created_at: f.created_at };
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
