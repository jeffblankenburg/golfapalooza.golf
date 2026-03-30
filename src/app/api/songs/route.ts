import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: songs, error } = await supabase
    .from("songs")
    .select("*, tagged_user:users!songs_tagged_user_id_fkey(id, display_name, avatar_url)")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get user's favorites
  const { data: favorites } = await supabase
    .from("song_favorites")
    .select("song_id")
    .eq("user_id", user.id);

  const favoriteIds = new Set((favorites || []).map((f) => f.song_id));

  const songsWithFavorites = (songs || []).map((song) => ({
    ...song,
    is_favorite: favoriteIds.has(song.id),
  }));

  return NextResponse.json({ songs: songsWithFavorites });
}
