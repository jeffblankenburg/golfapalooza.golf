import { NextResponse } from "next/server";
import { resolveGalleryItem } from "@/lib/v2/gallery";
import { sendV2Notifications } from "@/lib/v2/notifications";
import { orgSlug, orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";

/**
 * Comments on a gallery item.
 *   GET  — list (oldest first) with sender profile.
 *   POST { content } — add; notifies the uploader + prior commenters.
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
    .from("v2_gallery_comments")
    .select("id, content, created_at, sender_id, sender:v2_profiles!v2_gallery_comments_sender_id_fkey(display_name, first_name, last_name, avatar_url)")
    .eq("item_id", itemId)
    .order("created_at", { ascending: true });
  return NextResponse.json({ comments: data || [] });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ itemId: string }> },
) {
  const { itemId } = await params;
  const a = await resolveGalleryItem(request, itemId);
  if ("error" in a) return NextResponse.json({ error: a.error }, { status: a.status });

  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const content = (body.content || "").trim();
  if (!content) return NextResponse.json({ error: "Comment is empty" }, { status: 400 });

  const { data: comment, error } = await a.admin
    .from("v2_gallery_comments")
    .insert({ item_id: itemId, sender_id: a.userId, content })
    .select("id, content, created_at, sender_id, sender:v2_profiles!v2_gallery_comments_sender_id_fkey(display_name, first_name, last_name, avatar_url)")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the uploader + other commenters (excluding the author).
  const { data: priorComments } = await a.admin
    .from("v2_gallery_comments")
    .select("sender_id")
    .eq("item_id", itemId);
  const recipients = new Set<string>([a.item.uploader_id, ...(priorComments || []).map((c) => c.sender_id)]);
  recipients.delete(a.userId);
  if (recipients.size) {
    const sender = Array.isArray(comment?.sender) ? comment?.sender[0] : comment?.sender;
    const [slug, mode] = await Promise.all([
      orgSlug(a.admin, a.item.org_id),
      orgNameMode(a.admin, a.item.org_id),
    ]);
    await sendV2Notifications(a.admin, [...recipients], {
      orgId: a.item.org_id,
      type: "gallery_comment",
      title: "New comment on a photo",
      body: `${pickName(sender, mode, "Someone")}: ${content.slice(0, 80)}`,
      data: slug ? { url: `/new/${slug}?open=photos&photo=${itemId}` } : undefined,
    }).catch(() => {});
  }

  return NextResponse.json({ comment });
}
