import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";


/**
 * @swagger
 * /api/gallery:
 *   get:
 *     summary: List gallery items (paginated, optionally filtered by trip)
 *     tags: [Gallery]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         schema:
 *           type: string
 *         description: Optional filter by trip
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: string
 *         description: ISO timestamp for cursor-based pagination
 *       - in: query
 *         name: tagged_user_id
 *         schema:
 *           type: string
 *         description: Filter to items where this user is tagged
 *     responses:
 *       200:
 *         description: List of gallery items
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id"); // optional filter
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const cursor = searchParams.get("cursor");
  const taggedUserIds = searchParams.get("tagged_user_ids"); // comma-separated
  const year = searchParams.get("year"); // filter by calendar year of sort_date
  const mediaType = searchParams.get("media_type"); // "photo" or "video"
  const sortBy = searchParams.get("sort_by") === "uploaded" ? "created_at" : "sort_date";

  const effectiveUserId = await getEffectiveUserId(user.id);

  // If filtering by tagged users, get those item IDs first
  if (taggedUserIds) {
    const userIdList = taggedUserIds.split(",").filter(Boolean);

    // Find items tagged with ALL selected users (intersection)
    const tagResults = await Promise.all(
      userIdList.map((uid) =>
        supabase.from("gallery_tags").select("item_id").eq("tagged_user_id", uid)
      )
    );

    // Intersect: only items that appear in every user's tag set
    const idSets = tagResults.map(
      (r) => new Set((r.data || []).map((t) => t.item_id))
    );
    const intersection = idSets.reduce((acc, set) =>
      new Set([...acc].filter((id) => set.has(id)))
    );
    const taggedItemIds = [...intersection];

    if (taggedItemIds.length === 0) {
      return NextResponse.json({ items: [], hasMore: false });
    }

    let query = supabase
      .from("gallery_items")
      .select(
        `
        id, media_url, thumbnail_url, media_type, caption, width, height, created_at, taken_at, sort_date, trip_id, uploader_id,
        uploader:users!gallery_items_uploader_public_user_fk(id, display_name, avatar_url),
        reactions:gallery_reactions(id, emoji, user_id),
        tags:gallery_tags(tagged_user_id, tagger_id)
      `
      )
      .in("id", taggedItemIds)
      .order(sortBy, { ascending: false })
      .limit(limit);

    if (tripId) {
      query = query.eq("trip_id", tripId);
    }
    if (mediaType) {
      query = query.eq("media_type", mediaType);
    }
    if (year) {
      query = query.gte("sort_date", `${year}-01-01T00:00:00Z`).lt("sort_date", `${parseInt(year) + 1}-01-01T00:00:00Z`);
    }
    if (cursor) {
      query = query.lt(sortBy, cursor);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = (data || []).map((item) => enrichItem(item, effectiveUserId));
    return NextResponse.json({
      items,
      hasMore: items.length === limit,
    });
  }

  // Standard query - all items, optionally filtered by trip
  let query = supabase
    .from("gallery_items")
    .select(
      `
      id, media_url, thumbnail_url, media_type, caption, width, height, created_at, taken_at, sort_date, trip_id, uploader_id,
      uploader:users!gallery_items_uploader_public_user_fk(id, display_name, avatar_url),
      reactions:gallery_reactions(id, emoji, user_id),
      tags:gallery_tags(tagged_user_id, tagger_id)
    `
    )
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (tripId) {
    query = query.eq("trip_id", tripId);
  }
  if (mediaType) {
    query = query.eq("media_type", mediaType);
  }
  if (year) {
    query = query.gte("sort_date", `${year}-01-01T00:00:00Z`).lt("sort_date", `${parseInt(year) + 1}-01-01T00:00:00Z`);
  }
  if (cursor) {
    query = query.lt(sortBy, cursor);
  }

  const { data, error } = await query;
  if (error) {
    console.error("Gallery GET error:", error.message, error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = (data || []).map((item) => enrichItem(item, effectiveUserId));

  // Get comment counts in a separate query
  const itemIds = items.map((i) => i.id);
  if (itemIds.length > 0) {
    const { data: commentCounts } = await supabase
      .from("gallery_comments")
      .select("item_id")
      .in("item_id", itemIds);

    const countMap: Record<string, number> = {};
    for (const c of commentCounts || []) {
      countMap[c.item_id] = (countMap[c.item_id] || 0) + 1;
    }
    for (const item of items) {
      item.commentCount = countMap[item.id] || 0;
    }
  }

  return NextResponse.json({
    items,
    hasMore: items.length === limit,
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function enrichItem(item: any, currentUserId: string) {
  const uploader = Array.isArray(item.uploader)
    ? item.uploader[0]
    : item.uploader;
  const reactions = item.reactions || [];

  // Group reactions by emoji with counts
  const reactionSummary: Record<string, { count: number; hasReacted: boolean }> =
    {};
  for (const r of reactions) {
    if (!reactionSummary[r.emoji]) {
      reactionSummary[r.emoji] = { count: 0, hasReacted: false };
    }
    reactionSummary[r.emoji].count++;
    if (r.user_id === currentUserId) {
      reactionSummary[r.emoji].hasReacted = true;
    }
  }

  return {
    id: item.id,
    media_url: item.media_url,
    thumbnail_url: item.thumbnail_url,
    media_type: item.media_type,
    caption: item.caption,
    width: item.width,
    height: item.height,
    created_at: item.created_at,
    taken_at: item.taken_at || null,
    sort_date: item.sort_date || item.created_at,
    trip_id: item.trip_id || null,
    uploader_id: item.uploader_id,
    uploader,
    reactions: reactionSummary,
    reactionCount: reactions.length,
    tags: (item.tags || []).map(
      (t: { tagged_user_id: string; tagger_id: string }) => t.tagged_user_id
    ),
    commentCount: 0,
  };
}

/**
 * @swagger
 * /api/gallery:
 *   post:
 *     summary: Upload a photo or video to the gallery
 *     tags: [Gallery]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file, mediaType]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *               tripId:
 *                 type: string
 *                 description: Optional trip to associate with
 *               mediaType:
 *                 type: string
 *                 enum: [photo, video]
 *               caption:
 *                 type: string
 *               takenAt:
 *                 type: string
 *                 format: date-time
 *                 description: EXIF date extracted client-side
 *               thumbnailFile:
 *                 type: string
 *                 format: binary
 *               width:
 *                 type: integer
 *               height:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Gallery item created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File;
    const tripId = (formData.get("tripId") as string) || null;
    const mediaType = formData.get("mediaType") as string;
    const caption = (formData.get("caption") as string) || null;
    const takenAtStr = (formData.get("takenAt") as string) || null;
    const thumbnailFile = formData.get("thumbnailFile") as File | null;
    const width = formData.get("width")
      ? parseInt(formData.get("width") as string, 10)
      : null;
    const height = formData.get("height")
      ? parseInt(formData.get("height") as string, 10)
      : null;

    if (!file || !mediaType) {
      return NextResponse.json(
        { error: "file and mediaType are required" },
        { status: 400 }
      );
    }

    if (mediaType !== "photo" && mediaType !== "video") {
      return NextResponse.json(
        { error: "mediaType must be 'photo' or 'video'" },
        { status: 400 }
      );
    }

    // 50MB limit for videos
    if (mediaType === "video" && file.size > 100 * 1024 * 1024) {
      return NextResponse.json(
        { error: "Video files must be under 100MB" },
        { status: 400 }
      );
    }

    const effectiveUserId = await getEffectiveUserId(user.id);
    const simulating = await isSimulating();
    const client = simulating ? createAdminClient() : supabase;

    const timestamp = Date.now();
    const ext = file.name.split(".").pop() || (mediaType === "video" ? "mp4" : "jpg");
    const pathPrefix = tripId || "shared";
    const filePath = `${pathPrefix}/${timestamp}-${effectiveUserId}.${ext}`;

    // Upload main file — set explicit content type for proper browser playback
    const contentType = file.type || (mediaType === "video" ? "video/mp4" : "image/jpeg");
    const { data: uploadData, error: uploadError } = await client.storage
      .from("gallery-media")
      .upload(filePath, file, { cacheControl: "31536000", upsert: false, contentType });

    if (uploadError) {
      return NextResponse.json(
        { error: `Upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    const { data: urlData } = client.storage
      .from("gallery-media")
      .getPublicUrl(uploadData.path);

    let thumbnailUrl: string | null = null;

    // Upload thumbnail if provided
    if (thumbnailFile) {
      const thumbPath = `${pathPrefix}/thumbs/${timestamp}-${effectiveUserId}.jpg`;
      const { data: thumbData, error: thumbError } = await client.storage
        .from("gallery-media")
        .upload(thumbPath, thumbnailFile, {
          cacheControl: "31536000",
          upsert: false,
        });

      if (thumbError) {
        console.error("Thumbnail upload failed:", thumbError.message);
      } else if (thumbData) {
        const { data: thumbUrlData } = client.storage
          .from("gallery-media")
          .getPublicUrl(thumbData.path);
        thumbnailUrl = thumbUrlData.publicUrl;
      }
    } else {
      console.log("No thumbnail file provided in upload");
    }

    // Parse taken_at if provided
    const takenAt = takenAtStr ? new Date(takenAtStr) : null;

    // Insert gallery item
    const insertData: Record<string, unknown> = {
      uploader_id: effectiveUserId,
      media_url: urlData.publicUrl,
      thumbnail_url: thumbnailUrl,
      media_type: mediaType,
      caption,
      width,
      height,
    };
    if (tripId) insertData.trip_id = tripId;
    if (takenAt && !isNaN(takenAt.getTime())) insertData.taken_at = takenAt.toISOString();

    const { data: item, error: insertError } = await client
      .from("gallery_items")
      .insert(insertData)
      .select(
        `
        id, media_url, thumbnail_url, media_type, caption, width, height, created_at, taken_at, sort_date, trip_id, uploader_id,
        uploader:users!gallery_items_uploader_public_user_fk(id, display_name, avatar_url)
      `
      )
      .single();

    if (insertError) {
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ item }, { status: 201 });
  } catch (error) {
    console.error("Gallery upload error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("FormData") || message.includes("body")) {
      return NextResponse.json(
        { error: "File too large. Videos must be under 50MB." },
        { status: 413 }
      );
    }
    return NextResponse.json(
      { error: `Upload failed: ${message}` },
      { status: 500 }
    );
  }
}
