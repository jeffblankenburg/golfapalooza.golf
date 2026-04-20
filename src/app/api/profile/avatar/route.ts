import { NextRequest, NextResponse } from "next/server";
import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

/**
 * @swagger
 * /api/profile/avatar:
 *   post:
 *     summary: Upload a new avatar for the current (or simulated) user
 *     tags: [Profile]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Uploaded; returns the new avatar_url
 *       400:
 *         description: Missing or invalid file
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Upload failed
 */
export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "File must be an image" }, { status: 400 });
    }

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 5MB" }, { status: 400 });
    }

    const effectiveUserId = await getEffectiveUserId(user.id);
    const admin = createAdminClient();

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const timestamp = Date.now();
    const filePath = `${effectiveUserId}/avatar-${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("avatars")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from("avatars").getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;

    const { error: updateError } = await admin
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", effectiveUserId);

    if (updateError) {
      await admin.storage.from("avatars").remove([filePath]);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    // Clean up older avatar files in this user's folder
    const { data: existing } = await admin.storage
      .from("avatars")
      .list(effectiveUserId, { limit: 100 });
    if (existing && existing.length > 0) {
      const stale = existing
        .map((f) => `${effectiveUserId}/${f.name}`)
        .filter((p) => p !== filePath);
      if (stale.length > 0) {
        await admin.storage.from("avatars").remove(stale);
      }
    }

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error("Avatar upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
