import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/chat/rooms/{roomId}/reactions:
 *   post:
 *     summary: Add a reaction to a message
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageId, emoji]
 *             properties:
 *               messageId:
 *                 type: string
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction added
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, emoji } = await request.json();

  if (!messageId || !emoji) {
    return NextResponse.json(
      { error: "messageId and emoji are required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { error } = await client
    .from("chat_reactions")
    .upsert(
      { message_id: messageId, user_id: effectiveUserId, emoji },
      { onConflict: "message_id,user_id,emoji" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * @swagger
 * /api/chat/rooms/{roomId}/reactions:
 *   delete:
 *     summary: Remove a reaction from a message
 *     tags: [Chat]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [messageId, emoji]
 *             properties:
 *               messageId:
 *                 type: string
 *               emoji:
 *                 type: string
 *     responses:
 *       200:
 *         description: Reaction removed
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { messageId, emoji } = await request.json();

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { error } = await client
    .from("chat_reactions")
    .delete()
    .eq("message_id", messageId)
    .eq("user_id", effectiveUserId)
    .eq("emoji", emoji);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
