import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/users/{userId}/avatar:
 *   post:
 *     summary: Upload a new avatar on behalf of another user (admin only)
 *     tags: [Admin]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
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
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { userId } = await params;
  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
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

    const adminClient = createAdminClient();

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const timestamp = Date.now();
    const filePath = `${userId}/avatar-${timestamp}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await adminClient.storage
      .from("avatars")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "image/jpeg",
        cacheControl: "3600",
        upsert: true,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = adminClient.storage.from("avatars").getPublicUrl(filePath);
    const avatarUrl = urlData.publicUrl;

    const { error: updateError } = await adminClient
      .from("users")
      .update({ avatar_url: avatarUrl })
      .eq("id", userId);

    if (updateError) {
      await adminClient.storage.from("avatars").remove([filePath]);
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const { data: existing } = await adminClient.storage
      .from("avatars")
      .list(userId, { limit: 100 });
    if (existing && existing.length > 0) {
      const stale = existing
        .map((f) => `${userId}/${f.name}`)
        .filter((p) => p !== filePath);
      if (stale.length > 0) {
        await adminClient.storage.from("avatars").remove(stale);
      }
    }

    return NextResponse.json({ avatar_url: avatarUrl });
  } catch (err) {
    console.error("Admin avatar upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
