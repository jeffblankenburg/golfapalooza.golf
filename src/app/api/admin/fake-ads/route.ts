import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";
import { getEffectiveUserId } from "@/lib/simulator";

function extractStoragePath(url: string): string | null {
  const marker = "/gallery-media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function cleanupUploadedImage(admin: ReturnType<typeof createAdminClient>, url: string) {
  const path = extractStoragePath(url);
  if (path) {
    await admin.storage.from("gallery-media").remove([path]);
  }
}

// GET — list all fake ads (admin view, includes inactive)
export async function GET() {
  const user = await checkPermissionAccess("manage_fake_ads");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("fake_ads")
    .select("id, image_url, alt_text, active, sort_order, created_at, updated_at, fake_ad_loozers(user_id)")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ads: (data || []).map((ad) => ({
      id: ad.id,
      image_url: ad.image_url,
      alt_text: ad.alt_text,
      active: ad.active,
      sort_order: ad.sort_order,
      created_at: ad.created_at,
      updated_at: ad.updated_at,
      tagged_user_ids: ad.fake_ad_loozers?.map((t: { user_id: string }) => t.user_id) || [],
    })),
  });
}

// POST — upload image + create ad row + set tags (single multipart request)
export async function POST(request: NextRequest) {
  const user = await checkPermissionAccess("manage_fake_ads");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const altText = (formData.get("alt_text") as string | null)?.trim() || null;
    const taggedIdsRaw = formData.get("tagged_user_ids") as string | null;
    const active = formData.get("active") === "false" ? false : true;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Image must be under 10MB" }, { status: 400 });
    }

    const taggedUserIds: string[] = taggedIdsRaw
      ? JSON.parse(taggedIdsRaw).filter((id: unknown) => typeof id === "string")
      : [];

    const effectiveUserId = await getEffectiveUserId(user.id);
    const admin = createAdminClient();

    const timestamp = Date.now();
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const filePath = `fake-ads/${timestamp}-${effectiveUserId}.${ext}`;

    const arrayBuffer = await file.arrayBuffer();
    const { error: uploadError } = await admin.storage
      .from("gallery-media")
      .upload(filePath, arrayBuffer, {
        contentType: file.type || "image/png",
        cacheControl: "31536000",
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const { data: urlData } = admin.storage.from("gallery-media").getPublicUrl(filePath);
    const imageUrl = urlData.publicUrl;

    const { data: ad, error: insertError } = await admin
      .from("fake_ads")
      .insert({
        image_url: imageUrl,
        alt_text: altText,
        active,
        created_by: effectiveUserId,
      })
      .select()
      .single();

    if (insertError) {
      await cleanupUploadedImage(admin, imageUrl);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    if (taggedUserIds.length > 0) {
      const rows = taggedUserIds.map((uid) => ({ ad_id: ad.id, user_id: uid }));
      const { error: tagError } = await admin.from("fake_ad_loozers").insert(rows);
      if (tagError) {
        return NextResponse.json({ error: tagError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ ...ad, tagged_user_ids: taggedUserIds }, { status: 201 });
  } catch (err) {
    console.error("Fake ad upload error:", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
