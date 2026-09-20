import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

/**
 * DELETE — remove a comment. You can delete your own; a round player or the
 * round's creator can delete any (co-equal, mirrors the round's edit model).
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string; commentId: string }> }) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  const { id: roundId, commentId } = await params;

  const admin = v2AdminClient();
  const { data: comment } = await admin
    .from("v2_round_comments")
    .select("id, sender_id, round_id")
    .eq("id", commentId)
    .eq("round_id", roundId)
    .maybeSingle();
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  let canDelete = comment.sender_id === userId;
  if (!canDelete) {
    const { data: round } = await admin.from("v2_rounds").select("created_by").eq("id", roundId).maybeSingle();
    if (round?.created_by === userId) canDelete = true;
    if (!canDelete) {
      const { data: rp } = await admin
        .from("v2_round_players")
        .select("id")
        .eq("round_id", roundId)
        .eq("user_id", userId)
        .maybeSingle();
      if (rp) canDelete = true;
    }
  }
  if (!canDelete) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { error } = await admin.from("v2_round_comments").delete().eq("id", commentId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
