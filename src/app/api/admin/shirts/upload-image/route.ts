import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { getEffectiveUserId } from "@/lib/simulator";

const SHIRT_PERMISSION = "manage_event_settings";

/**
 * @swagger
 * /api/admin/shirts/upload-image:
 *   post:
 *     tags: [Admin]
 *     summary: Upload a shirt photo (multipart form, field "file")
 *     responses:
 *       200: { description: Public URL of the stored image }
 */
export async function POST(request: NextRequest) {
  const user = await checkPermissionAccess(SHIRT_PERMISSION);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!(file.type || "").startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    const maxBytes = 10 * 1024 * 1024; // 10MB
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
    }

    const effectiveUserId = await getEffectiveUserId(user.id);
    const admin = createAdminClient();

    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || "jpg";
    const filePath = `shirts/${timestamp}-${effectiveUserId}.${ext}`;

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

    const { data: urlData } = admin.storage.from("gallery-media").getPublicUrl(filePath);
    return NextResponse.json({ url: urlData.publicUrl });
  } catch (err) {
    console.error("Shirt image upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
