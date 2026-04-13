import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// DELETE - Hide a message for the current user only (iMessage-style)
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ roomId: string; messageId: string }> }
) {
  const { roomId, messageId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  // Verify user is a member of this room
  const { data: membership } = await admin
    .from("chat_room_members")
    .select("id")
    .eq("room_id", roomId)
    .eq("user_id", effectiveUserId)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  // Verify message exists in this room
  const { data: message } = await admin
    .from("chat_messages")
    .select("id")
    .eq("id", messageId)
    .eq("room_id", roomId)
    .single();

  if (!message) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  // Insert into hidden messages (ON CONFLICT DO NOTHING via upsert)
  const { error } = await admin
    .from("chat_hidden_messages")
    .upsert(
      { user_id: effectiveUserId, message_id: messageId },
      { onConflict: "user_id,message_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
