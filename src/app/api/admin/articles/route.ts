import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { checkPermissionAccess } from "@/lib/permissions-server";

/** Extract storage path from a gallery-media public URL */
function extractStoragePath(url: string): string | null {
  const marker = "/gallery-media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

/** Delete an uploaded article image from storage (best-effort) */
async function cleanupUploadedImage(admin: ReturnType<typeof createAdminClient>, url: string) {
  const path = extractStoragePath(url);
  if (path) {
    await admin.storage.from("gallery-media").remove([path]);
  }
}

// GET - List all articles for a trip (drafts + scheduled + published)
export async function GET(request: NextRequest) {
  const isAdmin = await checkPermissionAccess("manage_articles");
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("articles")
    .select(`
      id, title, content, publish_at, created_at, updated_at,
      featured_image_url, featured_image_source, featured_image_focal_x, featured_image_focal_y,
      author:users!articles_author_id_fkey(id, display_name, avatar_url),
      featured_image:gallery_items!articles_featured_image_id_fkey(id, media_url, thumbnail_url)
    `)
    .eq("trip_id", tripId)
    .order("publish_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data || [] });
}

// POST - Create a new article
export async function POST(request: NextRequest) {
  const isAdmin = await checkPermissionAccess("manage_articles");
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const body = await request.json();
  const {
    trip_id, title, content, featured_image_id, featured_image_url,
    featured_image_source, featured_image_focal_x, featured_image_focal_y, publish_at,
  } = body;

  if (!trip_id || !title?.trim()) {
    return NextResponse.json({ error: "trip_id and title are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("articles")
    .insert({
      trip_id,
      author_id: effectiveUserId,
      title: title.trim(),
      content: content || "",
      featured_image_id: featured_image_source === "gallery" ? (featured_image_id || null) : null,
      featured_image_url: featured_image_source !== "gallery" ? (featured_image_url || null) : null,
      featured_image_source: featured_image_source || "gallery",
      featured_image_focal_x: featured_image_focal_x ?? 50,
      featured_image_focal_y: featured_image_focal_y ?? 50,
      publish_at: publish_at || null,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT - Update an article
export async function PUT(request: NextRequest) {
  const isAdmin = await checkPermissionAccess("manage_articles");
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    id, title, content, featured_image_id, featured_image_url,
    featured_image_source, featured_image_focal_x, featured_image_focal_y, publish_at,
  } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch current article to check if we need to clean up an uploaded image
  const { data: current } = await admin
    .from("articles")
    .select("featured_image_source, featured_image_url")
    .eq("id", id)
    .single();

  const updates: Record<string, unknown> = {};
  if (title !== undefined) updates.title = title.trim();
  if (content !== undefined) updates.content = content;
  if (publish_at !== undefined) updates.publish_at = publish_at || null;

  // Handle image field updates
  if (featured_image_source !== undefined) {
    updates.featured_image_source = featured_image_source || "gallery";
    updates.featured_image_id = featured_image_source === "gallery" ? (featured_image_id || null) : null;
    updates.featured_image_url = featured_image_source !== "gallery" ? (featured_image_url || null) : null;
  } else {
    if (featured_image_id !== undefined) updates.featured_image_id = featured_image_id || null;
  }
  if (featured_image_focal_x !== undefined) updates.featured_image_focal_x = featured_image_focal_x;
  if (featured_image_focal_y !== undefined) updates.featured_image_focal_y = featured_image_focal_y;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  // Clean up old uploaded image if the source changed away from 'upload'
  if (
    current?.featured_image_source === "upload" &&
    current?.featured_image_url &&
    (featured_image_source !== "upload" || featured_image_url !== current.featured_image_url)
  ) {
    await cleanupUploadedImage(admin, current.featured_image_url);
  }

  const { data, error } = await admin
    .from("articles")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE - Delete an article
export async function DELETE(request: NextRequest) {
  const isAdmin = await checkPermissionAccess("manage_articles");
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id } = body;

  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch article to clean up uploaded image if needed
  const { data: article } = await admin
    .from("articles")
    .select("featured_image_source, featured_image_url")
    .eq("id", id)
    .single();

  if (article?.featured_image_source === "upload" && article?.featured_image_url) {
    await cleanupUploadedImage(admin, article.featured_image_url);
  }

  const { error } = await admin
    .from("articles")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
