import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { song_id } = await request.json();
  if (!song_id) {
    return NextResponse.json({ error: "song_id is required" }, { status: 400 });
  }

  const { error } = await supabase
    .from("song_plays")
    .insert({ user_id: user.id, song_id });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
