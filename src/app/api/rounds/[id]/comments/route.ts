import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { sendBulkNotifications } from "@/lib/notifications/service";

/**
 * @swagger
 * /api/rounds/{id}/comments:
 *   get:
 *     summary: List comments on a round (any status — no gate)
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of comments
 *       401:
 *         description: Unauthorized
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("round_comments")
    .select(
      `
      id, body, created_at, sender_id,
      sender:users!round_comments_sender_id_fkey(id, display_name, avatar_url)
    `
    )
    .eq("round_id", roundId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const comments = (data || []).map((c) => ({
    ...c,
    sender: Array.isArray(c.sender) ? c.sender[0] : c.sender,
  }));

  return NextResponse.json({ comments });
}

/**
 * @swagger
 * /api/rounds/{id}/comments:
 *   post:
 *     summary: Add a comment to a round (allowed on any status)
 *     tags: [Rounds]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *     responses:
 *       201:
 *         description: Comment created
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: roundId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const raw = (await request.json())?.body;
  const body = typeof raw === "string" ? raw.trim() : "";
  if (!body) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }
  if (body.length > 500) {
    return NextResponse.json(
      { error: "Comment must be 500 characters or fewer" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { data: comment, error } = await client
    .from("round_comments")
    .insert({ round_id: roundId, sender_id: effectiveUserId, body })
    .select(
      `
      id, body, created_at, sender_id,
      sender:users!round_comments_sender_id_fkey(id, display_name, avatar_url)
    `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort: notify roster players (except the commenter) that their round
  // got a comment. Deep-links to the read-only spectator scorecard.
  const admin = createAdminClient();
  const [{ data: roster }, { data: commenter }] = await Promise.all([
    admin
      .from("round_players")
      .select("user_id")
      .eq("round_id", roundId)
      .not("user_id", "is", null),
    admin
      .from("users")
      .select("display_name")
      .eq("id", effectiveUserId)
      .maybeSingle(),
  ]);

  const notifyIds = [
    ...new Set((roster || []).map((r) => r.user_id as string)),
  ].filter((uid) => uid && uid !== effectiveUserId);

  if (notifyIds.length > 0) {
    const preview = body.length > 80 ? body.slice(0, 80) + "…" : body;
    await sendBulkNotifications(notifyIds, {
      type: "round_comment",
      title: `${commenter?.display_name || "A Loozer"} commented on your round`,
      body: preview,
      data: { round_id: roundId, url: `/rounds/${roundId}/watch` },
    }).catch(console.error);
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
