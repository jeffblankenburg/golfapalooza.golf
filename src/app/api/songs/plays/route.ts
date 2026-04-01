import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);

  const { song_id } = await request.json();
  if (!song_id) {
    return NextResponse.json({ error: "song_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("song_plays")
    .insert({ user_id: effectiveUserId, song_id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
