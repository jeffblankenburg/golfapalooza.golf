import { NextResponse } from "next/server";
import { resolveGalleryItem, GALLERY_BUCKET } from "@/lib/v2/gallery";

/**
 * A single gallery item.
 *   GET    — full detail: uploader, reactions, tags (with profiles), comments.
 *   PATCH  { caption } — edit caption (uploader/admin).
 *   DELETE — uploader/admin; removes storage files too.
 * Auth: bearer/cookie; org-membership gated.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  const { data } = await a.admin
    .from("v2_gallery_items")
    .select(
      "id, org_id, uploader_id, media_url, thumbnail_url, media_type, caption, width, height, taken_at, created_at, uploader:v2_profiles!v2_gallery_items_uploader_id_fkey(display_name, avatar_url), reactions:v2_gallery_reactions(emoji, user_id), tags:v2_gallery_tags(tagged_user_id, tagged:v2_profiles!v2_gallery_tags_tagged_user_id_fkey(display_name))",
    )
    .eq("id", itemId)
    .maybeSingle();

  return NextResponse.json({ item: data });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });
  if (a.item.uploader_id !== a.userId) {
    // Only the uploader edits the caption (admins can via the admin surface later).
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  let body: { caption?: string | null };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const { error } = await a.admin
    .from("v2_gallery_items")
    .update({ caption: (body.caption || "").trim() || null })
    .eq("id", itemId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  // Uploader or org admin.
  if (a.item.uploader_id !== a.userId) {
    const { data: adminRow } = await a.admin
      .from("v2_memberships")
      .select("role")
      .eq("org_id", a.item.org_id)
      .eq("user_id", a.userId)
      .maybeSingle();
    if (!adminRow || !["owner", "admin"].includes(adminRow.role)) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }
  }

  await a.admin.from("v2_gallery_items").delete().eq("id", itemId);

  // Best-effort storage cleanup (only files we own in the v2 bucket).
  const paths: string[] = [];
  for (const url of [a.item.media_url, a.item.thumbnail_url]) {
    if (url && url.includes(`/${GALLERY_BUCKET}/`)) {
      paths.push(url.split(`/${GALLERY_BUCKET}/`)[1]);
    }
  }
  if (paths.length) {
    try {
      await a.admin.storage.from(GALLERY_BUCKET).remove(paths);
    } catch {
      /* best-effort */
    }
  }

  return NextResponse.json({ ok: true });
}
