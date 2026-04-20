import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

function extractStoragePath(url: string): string | null {
  const marker = "/gallery-media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

// PATCH — update alt_text / active / tagged_user_ids (image is immutable; re-upload to replace)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkPermissionAccess("manage_fake_ads");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const { alt_text, active, tagged_user_ids } = body;

  const admin = createAdminClient();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (alt_text !== undefined) updates.alt_text = alt_text?.trim() || null;
  if (active !== undefined) updates.active = !!active;

  const { error: updateErr } = await admin.from("fake_ads").update(updates).eq("id", id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  if (Array.isArray(tagged_user_ids)) {
    const { error: delErr } = await admin.from("fake_ad_loozers").delete().eq("ad_id", id);
    if (delErr) {
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
    if (tagged_user_ids.length > 0) {
      const rows = tagged_user_ids.map((uid: string) => ({ ad_id: id, user_id: uid }));
      const { error: insErr } = await admin.from("fake_ad_loozers").insert(rows);
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE — remove ad row, tag rows (cascade), and its storage object
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const user = await checkPermissionAccess("manage_fake_ads");
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const admin = createAdminClient();

  const { data: ad } = await admin
    .from("fake_ads")
    .select("image_url")
    .eq("id", id)
    .single();

  const { error } = await admin.from("fake_ads").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (ad?.image_url) {
    const path = extractStoragePath(ad.image_url);
    if (path) {
      await admin.storage.from("gallery-media").remove([path]);
    }
  }

  return NextResponse.json({ success: true });
}
