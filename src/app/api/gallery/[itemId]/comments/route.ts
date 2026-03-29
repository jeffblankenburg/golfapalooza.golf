import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/gallery/{itemId}/comments:
 *   get:
 *     summary: Get comments for a gallery item (paginated)
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO timestamp for cursor-based pagination
 *     responses:
 *       200:
 *         description: List of comments
 *       401:
 *         description: Unauthorized
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

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "30", 10);
  const cursor = searchParams.get("cursor");

  let query = supabase
    .from("gallery_comments")
    .select(
      `
      id, content, created_at, sender_id,
      sender:users!gallery_comments_sender_public_user_fk(id, display_name, avatar_url)
    `
    )
    .eq("item_id", itemId)
    .order("created_at", { ascending: true })
    .limit(limit);

  if (cursor) {
    query = query.gt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const comments = (data || []).map((c) => ({
    ...c,
    sender: Array.isArray(c.sender) ? c.sender[0] : c.sender,
  }));

  return NextResponse.json({
    comments,
    hasMore: comments.length === limit,
  });
}

/**
 * @swagger
 * /api/gallery/{itemId}/comments:
 *   post:
 *     summary: Add a comment to a gallery item
 *     tags: [Gallery]
 *     parameters:
 *       - in: path
 *         name: itemId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [content]
 *             properties:
 *               content:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 *       401:
 *         description: Unauthorized
 */
export async function POST(
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

  const { content } = await request.json();
  if (!content || !content.trim()) {
    return NextResponse.json(
      { error: "content is required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { data: comment, error } = await client
    .from("gallery_comments")
    .insert({
      item_id: itemId,
      sender_id: effectiveUserId,
      content: content.trim(),
    })
    .select(
      `
      id, content, created_at, sender_id,
      sender:users!gallery_comments_sender_public_user_fk(id, display_name, avatar_url)
    `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      comment: {
        ...comment,
        sender: Array.isArray(comment.sender)
          ? comment.sender[0]
          : comment.sender,
      },
    },
    { status: 201 }
  );
}
