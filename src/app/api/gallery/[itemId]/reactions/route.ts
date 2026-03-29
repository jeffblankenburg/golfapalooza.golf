import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/gallery/{itemId}/reactions:
 *   post:
 *     summary: Add a reaction to a gallery item
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
 *             required: [emoji]
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction added
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

  const { emoji } = await request.json();
  if (!emoji) {
    return NextResponse.json(
      { error: "emoji is required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { error } = await client
    .from("gallery_reactions")
    .upsert(
      { item_id: itemId, user_id: effectiveUserId, emoji },
      { onConflict: "item_id,user_id,emoji" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * @swagger
 * /api/gallery/{itemId}/reactions:
 *   delete:
 *     summary: Remove a reaction from a gallery item
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
 *             required: [emoji]
 *             properties:
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction removed
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

  const { emoji } = await request.json();

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { error } = await client
    .from("gallery_reactions")
    .delete()
    .eq("item_id", itemId)
    .eq("user_id", effectiveUserId)
    .eq("emoji", emoji);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
