import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

export async function GET() {
  const admin = await checkPermissionAccess("manage_music");
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
    adminClient.rpc("song_play_counts"),
    adminClient.rpc("song_favorite_counts"),
  ]);

  if (songsResult.error) {
    return NextResponse.json({ error: songsResult.error.message }, { status: 500 });
  }

  const playCounts = new Map<string, number>();
  for (const row of (playsResult.data || []) as Array<{ song_id: string; play_count: number }>) {
    playCounts.set(row.song_id, Number(row.play_count));
  }

  const likeCounts = new Map<string, number>();
  for (const row of (favoritesResult.data || []) as Array<{ song_id: string; like_count: number }>) {
    likeCounts.set(row.song_id, Number(row.like_count));
  }

  const songs = (songsResult.data || []).map((song) => ({
    ...song,
    play_count: playCounts.get(song.id) || 0,
    like_count: likeCounts.get(song.id) || 0,
  }));

  return NextResponse.json({ songs });
}

export async function POST(request: Request) {
  const admin = await checkPermissionAccess("manage_music");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized — you need the manage_music permission" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { songId, title, mp3Url, artUrl, artThumbUrl, lyrics, taggedUserId, durationSeconds, sortOrder } = body;

    if (!songId || !title || !mp3Url) {
      return NextResponse.json({ error: "songId, title, and mp3Url are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    const { data: song, error: insertError } = await adminClient
      .from("songs")
      .insert({
        id: songId,
        title,
        mp3_url: mp3Url,
        art_url: artUrl || null,
        art_thumb_url: artThumbUrl || null,
        lyrics: lyrics || null,
        duration_seconds: durationSeconds ? parseInt(durationSeconds) : null,
        tagged_user_id: taggedUserId || null,
        sort_order: sortOrder != null ? parseInt(sortOrder) : 0,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Songs POST: DB insert failed:", insertError);
      return NextResponse.json({ error: `DB insert failed: ${insertError.message}` }, { status: 500 });
    }

    return NextResponse.json({ song });
  } catch (error) {
    console.error("Upload song error:", error);
    return NextResponse.json({ error: "Failed to save song record" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = await checkPermissionAccess("manage_music");
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();

  // Bulk reorder
  if (body.action === "reorder" && Array.isArray(body.order)) {
    const adminClient = createAdminClient();
    for (const item of body.order as Array<{ id: string; sort_order: number }>) {
      await adminClient.from("songs").update({ sort_order: item.sort_order }).eq("id", item.id);
    }
    return NextResponse.json({ success: true });
  }

  const { id, title, lyrics, tagged_user_id, sort_order } = body;
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
  const admin = await checkPermissionAccess("manage_music");
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
