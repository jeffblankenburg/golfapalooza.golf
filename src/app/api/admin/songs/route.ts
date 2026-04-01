import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkMusicAccess() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin, permissions")
    .eq("id", user.id)
    .single();

  if (!profile) return null;

  const perms = profile.permissions as Record<string, boolean> | null;
  if (!profile.is_admin && !perms?.manage_music) return null;

  return user;
}

export async function GET() {
  const admin = await checkMusicAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const [songsResult, playsResult, favoritesResult] = await Promise.all([
    adminClient
      .from("songs")
      .select("*, tagged_user:users!songs_tagged_user_id_fkey(id, display_name)")
      .order("sort_order", { ascending: true })
      .order("title", { ascending: true }),
    adminClient
      .from("song_plays")
      .select("song_id"),
    adminClient
      .from("song_favorites")
      .select("song_id"),
  ]);

  if (songsResult.error) {
    return NextResponse.json({ error: songsResult.error.message }, { status: 500 });
  }

  // Count plays per song
  const playCounts = new Map<string, number>();
  for (const row of playsResult.data || []) {
    playCounts.set(row.song_id, (playCounts.get(row.song_id) || 0) + 1);
  }

  // Count likes per song
  const likeCounts = new Map<string, number>();
  for (const row of favoritesResult.data || []) {
    likeCounts.set(row.song_id, (likeCounts.get(row.song_id) || 0) + 1);
  }

  const songs = (songsResult.data || []).map((song) => ({
    ...song,
    play_count: playCounts.get(song.id) || 0,
    like_count: likeCounts.get(song.id) || 0,
  }));

  return NextResponse.json({ songs });
}

export async function POST(request: Request) {
  const admin = await checkMusicAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const mp3File = formData.get("mp3") as File;
    const artFile = formData.get("art") as File | null;
    const artThumbFile = formData.get("art_thumb") as File | null;
    const title = formData.get("title") as string;
    const lyrics = formData.get("lyrics") as string | null;
    const taggedUserId = formData.get("tagged_user_id") as string | null;
    const durationSeconds = formData.get("duration_seconds") as string | null;
    const sortOrder = formData.get("sort_order") as string | null;

    if (!mp3File || !title) {
      return NextResponse.json(
        { error: "mp3 file and title are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const songId = crypto.randomUUID();
    const timestamp = Date.now();

    // Upload MP3
    const mp3Path = `audio/${timestamp}-${songId}.mp3`;
    const { error: mp3Error } = await adminClient.storage
      .from("songs")
      .upload(mp3Path, mp3File, { cacheControl: "31536000", upsert: true });

    if (mp3Error) {
      return NextResponse.json(
        { error: `Failed to upload MP3: ${mp3Error.message}` },
        { status: 500 }
      );
    }

    const { data: mp3UrlData } = adminClient.storage
      .from("songs")
      .getPublicUrl(mp3Path);

    // Upload art if provided (full 512px + 80px thumbnail)
    let artUrl: string | null = null;
    let artThumbUrl: string | null = null;
    if (artFile && artFile.size > 0) {
      const ext = artFile.name.split(".").pop() || "jpg";
      const artPath = `art/${timestamp}-${songId}.${ext}`;
      const { error: artError } = await adminClient.storage
        .from("songs")
        .upload(artPath, artFile, { cacheControl: "31536000", upsert: true });

      if (artError) {
        return NextResponse.json(
          { error: `Failed to upload art: ${artError.message}` },
          { status: 500 }
        );
      }

      const { data: artUrlData } = adminClient.storage
        .from("songs")
        .getPublicUrl(artPath);
      artUrl = artUrlData.publicUrl;

      // Upload thumbnail
      if (artThumbFile && artThumbFile.size > 0) {
        const thumbExt = artThumbFile.name.split(".").pop() || "jpg";
        const thumbPath = `art/${timestamp}-${songId}-thumb.${thumbExt}`;
        const { error: thumbError } = await adminClient.storage
          .from("songs")
          .upload(thumbPath, artThumbFile, { cacheControl: "31536000", upsert: true });

        if (!thumbError) {
          const { data: thumbUrlData } = adminClient.storage
            .from("songs")
            .getPublicUrl(thumbPath);
          artThumbUrl = thumbUrlData.publicUrl;
        }
      }
    }

    // Insert song record
    const { data: song, error: insertError } = await adminClient
      .from("songs")
      .insert({
        id: songId,
        title,
        mp3_url: mp3UrlData.publicUrl,
        art_url: artUrl,
        art_thumb_url: artThumbUrl,
        lyrics: lyrics || null,
        duration_seconds: durationSeconds ? parseInt(durationSeconds) : null,
        tagged_user_id: taggedUserId || null,
        sort_order: sortOrder ? parseInt(sortOrder) : 0,
      })
      .select()
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ song });
  } catch (error) {
    console.error("Upload song error:", error);
    return NextResponse.json(
      { error: "Failed to upload song" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const admin = await checkMusicAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, title, lyrics, tagged_user_id, sort_order } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title;
  if (lyrics !== undefined) updates.lyrics = lyrics;
  if (tagged_user_id !== undefined) updates.tagged_user_id = tagged_user_id || null;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  const { error } = await adminClient
    .from("songs")
    .update(updates)
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const admin = await checkMusicAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  // Get song to find storage paths
  const { data: song } = await adminClient
    .from("songs")
    .select("mp3_url, art_url, art_thumb_url")
    .eq("id", id)
    .single();

  if (song) {
    // Remove files from storage (best-effort)
    const filesToRemove: string[] = [];

    for (const url of [song.mp3_url, song.art_url, song.art_thumb_url]) {
      if (url) {
        const match = url.match(/\/songs\/(.+?)(\?|$)/);
        if (match) filesToRemove.push(match[1]);
      }
    }

    if (filesToRemove.length > 0) {
      await adminClient.storage.from("songs").remove(filesToRemove);
    }
  }

  const { error } = await adminClient.from("songs").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
