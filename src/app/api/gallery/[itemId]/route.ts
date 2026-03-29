import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/gallery/{itemId}:
 *   get:
 *     summary: Get a single gallery item with full details
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Gallery item details
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Item not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { data: item, error } = await supabase
    .from("gallery_items")
    .select(
      `
      id, media_url, thumbnail_url, media_type, caption, width, height, created_at, taken_at, sort_date, trip_id, uploader_id,
      uploader:users!gallery_items_uploader_public_user_fk(id, display_name, avatar_url),
      reactions:gallery_reactions(id, emoji, user_id),
      tags:gallery_tags(tagged_user_id, tagger_id, tagged_user:users!gallery_tags_tagged_public_user_fk(id, display_name, avatar_url))
    `
    )
    .eq("id", itemId)
    .single();

  if (error || !item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Get comment count
  const { count } = await supabase
    .from("gallery_comments")
    .select("id", { count: "exact", head: true })
    .eq("item_id", itemId);

  const uploader = Array.isArray(item.uploader)
    ? item.uploader[0]
    : item.uploader;
  const reactions = item.reactions || [];

  // Group reactions by emoji
  const reactionSummary: Record<
    string,
    { count: number; hasReacted: boolean }
  > = {};
  for (const r of reactions) {
    if (!reactionSummary[r.emoji]) {
      reactionSummary[r.emoji] = { count: 0, hasReacted: false };
    }
    reactionSummary[r.emoji].count++;
    if (r.user_id === effectiveUserId) {
      reactionSummary[r.emoji].hasReacted = true;
    }
  }

  return NextResponse.json({
    item: {
      id: item.id,
      media_url: item.media_url,
      thumbnail_url: item.thumbnail_url,
      media_type: item.media_type,
      caption: item.caption,
      width: item.width,
      height: item.height,
      created_at: item.created_at,
      taken_at: item.taken_at || null,
      sort_date: item.sort_date || item.created_at,
      trip_id: item.trip_id || null,
      uploader_id: item.uploader_id,
      uploader,
      reactions: reactionSummary,
      reactionCount: reactions.length,
      tags: (item.tags || []).map(
        (t: {
          tagged_user_id: string;
          tagger_id: string;
          tagged_user: { id: string; display_name: string; avatar_url: string | null } | { id: string; display_name: string; avatar_url: string | null }[];
        }) => {
          const taggedUser = Array.isArray(t.tagged_user)
            ? t.tagged_user[0]
            : t.tagged_user;
          return {
            user_id: t.tagged_user_id,
            display_name: taggedUser?.display_name,
            avatar_url: taggedUser?.avatar_url,
          };
        }
      ),
      commentCount: count || 0,
    },
  });
}

/**
 * @swagger
 * /api/gallery/{itemId}:
 *   delete:
 *     summary: Delete a gallery item (uploader or admin only)
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Item deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ itemId: string }> }
) {
  const { itemId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  // Fetch item to check ownership and get storage paths
  const { data: item } = await admin
    .from("gallery_items")
    .select("id, uploader_id, media_url, thumbnail_url")
    .eq("id", itemId)
    .single();

  if (!item) {
    return NextResponse.json({ error: "Item not found" }, { status: 404 });
  }

  // Check permission: uploader or admin
  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", effectiveUserId)
    .single();

  if (item.uploader_id !== effectiveUserId && !profile?.is_admin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Remove files from storage (best-effort)
  const pathsToRemove: string[] = [];
  for (const url of [item.media_url, item.thumbnail_url]) {
    if (url) {
      const match = url.match(/gallery-media\/(.+?)(\?|$)/);
      if (match) pathsToRemove.push(match[1]);
    }
  }

  if (pathsToRemove.length > 0) {
    await admin.storage.from("gallery-media").remove(pathsToRemove);
  }

  // Delete from database (cascade deletes reactions, comments, tags)
  const { error } = await admin
    .from("gallery_items")
    .delete()
    .eq("id", itemId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
