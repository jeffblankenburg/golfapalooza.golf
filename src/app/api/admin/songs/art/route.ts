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

export async function PUT(request: Request) {
  const admin = await checkMusicAccess();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const songId = formData.get("id") as string;
    const artFile = formData.get("art") as File;
    const artThumbFile = formData.get("art_thumb") as File | null;

    if (!songId || !artFile) {
      return NextResponse.json({ error: "id and art are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const timestamp = Date.now();

    // Remove old art files (best-effort)
    const { data: song } = await adminClient
      .from("songs")
      .select("art_url, art_thumb_url")
      .eq("id", songId)
      .single();

    if (song) {
      const toRemove: string[] = [];
      for (const url of [song.art_url, song.art_thumb_url]) {
        if (url) {
          const match = url.match(/\/songs\/(.+?)(\?|$)/);
          if (match) toRemove.push(match[1]);
        }
      }
      if (toRemove.length > 0) {
        await adminClient.storage.from("songs").remove(toRemove);
      }
    }

    // Upload new full art
    const ext = artFile.name.split(".").pop() || "jpg";
    const artPath = `art/${timestamp}-${songId}.${ext}`;
    const { error: artError } = await adminClient.storage
      .from("songs")
      .upload(artPath, artFile, { cacheControl: "31536000", upsert: true });

    if (artError) {
      return NextResponse.json({ error: `Failed to upload art: ${artError.message}` }, { status: 500 });
    }

    const { data: artUrlData } = adminClient.storage.from("songs").getPublicUrl(artPath);

    // Upload thumbnail
    let artThumbUrl: string | null = null;
    if (artThumbFile && artThumbFile.size > 0) {
      const thumbExt = artThumbFile.name.split(".").pop() || "jpg";
      const thumbPath = `art/${timestamp}-${songId}-thumb.${thumbExt}`;
      const { error: thumbError } = await adminClient.storage
        .from("songs")
        .upload(thumbPath, artThumbFile, { cacheControl: "31536000", upsert: true });

      if (!thumbError) {
        const { data: thumbUrlData } = adminClient.storage.from("songs").getPublicUrl(thumbPath);
        artThumbUrl = thumbUrlData.publicUrl;
      }
    }

    // Update song record
    const { error: updateError } = await adminClient
      .from("songs")
      .update({ art_url: artUrlData.publicUrl, art_thumb_url: artThumbUrl })
      .eq("id", songId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ art_url: artUrlData.publicUrl, art_thumb_url: artThumbUrl });
  } catch (error) {
    console.error("Replace song art error:", error);
    return NextResponse.json({ error: "Failed to replace art" }, { status: 500 });
  }
}
