import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/notifications:
 *   get:
 *     summary: List current user's notifications
 *     tags: [Notifications]
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO timestamp for cursor-based pagination
 *     responses:
 *       200:
 *         description: List of notifications
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const cursor = searchParams.get("cursor");

  let query = client
    .from("notifications")
    .select("*")
    .eq("user_id", effectiveUserId)
    .neq("type", "chat_message")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ notifications: data });
}

/**
 * @swagger
 * /api/notifications:
 *   patch:
 *     summary: Mark notifications as read
 *     tags: [Notifications]
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ids:
 *                 type: array
 *                 items:
 *                   type: string
 *               markAll:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Notifications marked as read
 *       401:
 *         description: Unauthorized
 */
export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const body = await request.json();

  if (body.markAll) {
    const { error } = await client
      .from("notifications")
      .update({ read: true })
      .eq("user_id", effectiveUserId)
      .eq("read", false);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  } else if (body.ids?.length) {
    const { error } = await client
      .from("notifications")
      .update({ read: true })
      .eq("user_id", effectiveUserId)
      .in("id", body.ids);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { id, all } = await request.json();

  if (!id && !all) {
    return NextResponse.json({ error: "id or all is required" }, { status: 400 });
  }

  const query = client
    .from("notifications")
    .delete()
    .eq("user_id", effectiveUserId);

  const { error } = all ? await query : await query.eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
