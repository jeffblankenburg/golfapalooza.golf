import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/gallery/reprocess:
 *   post:
 *     summary: Replace a gallery item's media file with a compressed version
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [itemId, file, width, height]
 *             properties:
 *               itemId:
 *                 type: string
 *               file:
 *                 type: string
 *                 format: binary
 *               width:
 *                 type: integer
 *               height:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Video reprocessed successfully
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const itemId = formData.get("itemId") as string;
    const file = formData.get("file") as File;
    const width = parseInt(formData.get("width") as string, 10);
    const height = parseInt(formData.get("height") as string, 10);

    if (!itemId || !file || !width || !height) {
      return NextResponse.json(
        { error: "itemId, file, width, and height are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Fetch existing item
    const { data: item, error: fetchError } = await adminClient
      .from("gallery_items")
      .select("id, media_url, trip_id, uploader_id")
      .eq("id", itemId)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ error: "Item not found" }, { status: 404 });
    }

    // Extract old storage path from media_url
    const oldPathMatch = item.media_url.match(/gallery-media\/(.+?)(\?|$)/);
    const oldPath = oldPathMatch ? oldPathMatch[1] : null;

    // Upload new file to a new path
    const timestamp = Date.now();
    const mimeToExt: Record<string, string> = {
      "image/jpeg": "jpg",
      "image/png": "png",
      "video/mp4": "mp4",
      "video/webm": "webm",
    };
    const ext = mimeToExt[file.type] || file.type.split("/")[1] || "bin";
    const pathPrefix = item.trip_id || "shared";
    const newPath = `${pathPrefix}/${timestamp}-${item.uploader_id}.${ext}`;

    const { data: uploadData, error: uploadError } = await adminClient.storage
      .from("gallery-media")
      .upload(newPath, file, { cacheControl: "31536000", upsert: false });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = adminClient.storage
      .from("gallery-media")
      .getPublicUrl(uploadData.path);

    // Update gallery_items record
    const { error: updateError } = await adminClient
      .from("gallery_items")
      .update({
        media_url: urlData.publicUrl,
        width,
        height,
      })
      .eq("id", itemId);

    if (updateError) {
      return NextResponse.json(
        { error: `DB update failed: ${updateError.message}` },
        { status: 500 }
      );
    }

    // Delete old file (best-effort)
    if (oldPath) {
      await adminClient.storage
        .from("gallery-media")
        .remove([decodeURIComponent(oldPath)]);
    }

    return NextResponse.json({
      success: true,
      item: { id: itemId, media_url: urlData.publicUrl, width, height },
    });
  } catch (error) {
    console.error("Gallery reprocess error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Reprocess failed: ${message}` },
      { status: 500 }
    );
  }
}
