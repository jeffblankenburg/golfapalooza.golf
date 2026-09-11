import { NextResponse } from "next/server";
import { resolveGalleryItem } from "@/lib/v2/gallery";
import { sendV2Notifications } from "@/lib/v2/notifications";
import { orgSlug, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * Tags on a gallery item.
 *   POST   { userIds[] } — tag Loozers (idempotent); notifies the newly tagged.
 *   DELETE { userId }    — remove a tag.
 * Auth: bearer/cookie; org-membership gated.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { userIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const userIds = [...new Set((body.userIds || []).filter(Boolean))];
  if (!userIds.length) return NextResponse.json({ error: "userIds required" }, { status: 400 });

  // Which are actually new (for notifications).
  const { data: existing } = await a.admin
    .from("v2_gallery_tags")
    .select("tagged_user_id")
    .eq("item_id", itemId);
  const already = new Set((existing || []).map((t) => t.tagged_user_id));

  const { error } = await a.admin
    .from("v2_gallery_tags")
    .upsert(
      userIds.map((uid) => ({ item_id: itemId, tagged_user_id: uid, tagger_id: a.userId })),
      { onConflict: "item_id,tagged_user_id" },
    );
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const notify = userIds.filter((uid) => uid !== a.userId && !already.has(uid));
  if (notify.length) {
    const [{ data: me }, slug, mode] = await Promise.all([
      a.admin.from("v2_profiles").select("display_name, first_name, last_name").eq("id", a.userId).maybeSingle(),
      orgSlug(a.admin, a.item.org_id),
      orgNameMode(a.admin, a.item.org_id),
    ]);
    await sendV2Notifications(a.admin, notify, {
      orgId: a.item.org_id,
      type: "gallery_tag",
      title: "You were tagged in a photo",
      body: `${pickName(me, mode, "Someone")} tagged you`,
      data: slug ? { url: `/new/${slug}?open=photos&photo=${itemId}` } : undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { userId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.userId) return NextResponse.json({ error: "userId required" }, { status: 400 });

  const { error } = await a.admin
    .from("v2_gallery_tags")
    .delete()
    .eq("item_id", itemId)
    .eq("tagged_user_id", body.userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
