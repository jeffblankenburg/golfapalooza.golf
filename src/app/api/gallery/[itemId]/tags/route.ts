import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * @swagger
 * /api/gallery/{itemId}/tags:
 *   post:
 *     summary: Tag Loozers in a gallery item
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
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Tags created
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

  const { userIds } = await request.json();
  if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
    return NextResponse.json(
      { error: "userIds array is required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  // Insert tags (ignore conflicts for already-tagged users)
  const { error } = await client.from("gallery_tags").upsert(
    userIds.map((uid: string) => ({
      item_id: itemId,
      tagged_user_id: uid,
      tagger_id: effectiveUserId,
    })),
    { onConflict: "item_id,tagged_user_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Send notifications to tagged users (excluding the tagger)
  const admin = createAdminClient();
  const { data: tagger } = await admin
    .from("users")
    .select("display_name")
    .eq("id", effectiveUserId)
    .single();

  const taggerName = tagger?.display_name || "Someone";
  const notifyIds = userIds.filter((uid: string) => uid !== effectiveUserId);

  if (notifyIds.length > 0) {
    await sendBulkNotifications(notifyIds, {
      type: "gallery_tag",
      title: taggerName,
      body: "Tagged you in a photo",
      data: { itemId },
    }).catch(console.error);
  }

  return NextResponse.json({ success: true }, { status: 201 });
}

/**
 * @swagger
 * /api/gallery/{itemId}/tags:
 *   delete:
 *     summary: Remove a tag from a gallery item
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
 *             required: [userId]
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tag removed
 *       401:
 *         description: Unauthorized
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

  const { userId } = await request.json();
  if (!userId) {
    return NextResponse.json(
      { error: "userId is required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  // RLS allows tagger or admin to delete
  const { error } = await client
    .from("gallery_tags")
    .delete()
    .eq("item_id", itemId)
    .eq("tagged_user_id", userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
