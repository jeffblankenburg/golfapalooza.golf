import { createClient, getAuthUser } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { MusicPage } from "@/components/music/MusicPage";

export default async function MusicPageRoute() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const supabase = await createClient();

  const { data: songs } = await supabase
    .from("songs")
    .select("*, tagged_user:users!songs_tagged_user_id_fkey(id, display_name, avatar_url)")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  const { data: favorites } = await supabase
    .from("song_favorites")
    .select("song_id")
    .eq("user_id", user.id);

  const favoriteIds = new Set((favorites || []).map((f) => f.song_id));

  const songsWithFavorites = (songs || []).map((song) => ({
    ...song,
    is_favorite: favoriteIds.has(song.id),
  }));

  return <MusicPage initialSongs={songsWithFavorites} />;
}
