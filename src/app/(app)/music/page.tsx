import { createClient, getAuthUser } from "@/lib/supabase/server";
import { getEffectiveUserId } from "@/lib/simulator";
import { redirect } from "next/navigation";
import { MusicPage } from "@/components/music/MusicPage";
import { AdminLink } from "@/components/AdminLink";

export default async function MusicPageRoute() {
  const user = await getAuthUser();
  if (!user) redirect("/login");

  const effectiveUserId = await getEffectiveUserId(user.id);
  const supabase = await createClient();

  const { data: songs } = await supabase
    .from("songs")
    .select("*, tagged_user:users!songs_tagged_user_id_fkey(id, display_name, avatar_url)")
    .order("sort_order", { ascending: true })
    .order("title", { ascending: true });

  const { data: favorites } = await supabase
    .from("song_favorites")
    .select("song_id")
    .eq("user_id", effectiveUserId);

  const favoriteIds = new Set((favorites || []).map((f) => f.song_id));

  const songsWithFavorites = (songs || []).map((song) => ({
    ...song,
    is_favorite: favoriteIds.has(song.id),
  }));

  return (
    <div className="relative">
      <div className="absolute top-4 right-4 z-10">
        <AdminLink permissionKey="manage_music" href="/admin/music" />
      </div>
      <MusicPage initialSongs={songsWithFavorites} />
    </div>
  );
}
