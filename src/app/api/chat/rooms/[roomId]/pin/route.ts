import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

// PATCH - Toggle pin state for current user
export async function PATCH(
  _request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  const { roomId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  // Get current membership row
  const { data: membership, error: fetchError } = await admin
    .from("chat_room_members")
    .select("id, is_pinned")
    .eq("room_id", roomId)
    .eq("user_id", effectiveUserId)
    .single();

  if (fetchError || !membership) {
    return NextResponse.json({ error: "Not a member of this room" }, { status: 403 });
  }

  const newPinned = !membership.is_pinned;

  const { error: updateError } = await admin
    .from("chat_room_members")
    .update({ is_pinned: newPinned })
    .eq("id", membership.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ is_pinned: newPinned });
}
