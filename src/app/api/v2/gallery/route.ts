import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";

/**
 * Gallery items for an org.
 *   GET  ?orgId=&cursor=<sort_date ISO>&mediaType=&taggedUserId= — newest-first,
 *        cursor-paginated; includes uploader, reactions, tags, comment count.
 *   POST { orgId, mediaUrl, thumbnailUrl?, mediaType, caption?, takenAt?, width?,
 *          height?, bulkId?, taggedUserIds?[] } — record an uploaded item (+tags).
 * Auth: bearer/cookie; org-membership gated.
 */
const PAGE = 24;
const ITEM_SELECT =
  "id, uploader_id, media_url, thumbnail_url, media_type, caption, width, height, taken_at, created_at, sort_date, uploader:v2_profiles!v2_gallery_items_uploader_id_fkey(display_name, avatar_url), reactions:v2_gallery_reactions(emoji, user_id), tags:v2_gallery_tags(tagged_user_id), comments:v2_gallery_comments(count)";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const cursor = url.searchParams.get("cursor");
  const sort = url.searchParams.get("sort") === "uploaded" ? "uploaded" : "taken";
  const year = url.searchParams.get("year"); // "all" or a 4-digit year
  const taggedParam = url.searchParams.get("taggedUserIds"); // comma-separated
  const limit = Math.min(Number(url.searchParams.get("limit")) || PAGE, 60);

  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Order + cursor + year all key off the chosen date column.
  const col = sort === "uploaded" ? "created_at" : "sort_date";

  // Loozer filter: items tagged with ANY of the selected users.
  const taggedIds = (taggedParam || "").split(",").map((s) => s.trim()).filter(Boolean);
  let taggedItemIds: string[] | null = null;
  if (taggedIds.length) {
    const { data } = await admin.from("v2_gallery_tags").select("item_id").in("tagged_user_id", taggedIds);
    taggedItemIds = [...new Set((data || []).map((t) => t.item_id))];
    if (taggedItemIds.length === 0) return NextResponse.json({ items: [], nextCursor: null });
  }

  let q = admin
    .from("v2_gallery_items")
    .select(ITEM_SELECT)
    .eq("org_id", orgId)
    .order(col, { ascending: false })
    .limit(limit + 1);
  if (cursor) q = q.lt(col, cursor);
  if (year && /^\d{4}$/.test(year)) {
    q = q.gte(col, `${year}-01-01`).lt(col, `${Number(year) + 1}-01-01`);
  }
  if (taggedItemIds) q = q.in("id", taggedItemIds);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = data || [];
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? (items[items.length - 1] as unknown as Record<string, string>)[col]
    : null;
  return NextResponse.json({ items, nextCursor });
}

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    orgId?: string;
    mediaUrl?: string;
    thumbnailUrl?: string | null;
    mediaType?: string;
    caption?: string | null;
    takenAt?: string | null;
    width?: number | null;
    height?: number | null;
    bulkId?: string | null;
    taggedUserIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.orgId || !body.mediaUrl || (body.mediaType !== "photo" && body.mediaType !== "video")) {
    return NextResponse.json({ error: "orgId, mediaUrl, mediaType required" }, { status: 400 });
  }

  const admin = v2AdminClient();
  if (!(await isOrgMember(admin, userId, body.orgId))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: item, error } = await admin
    .from("v2_gallery_items")
    .insert({
      org_id: body.orgId,
      uploader_id: userId,
      media_url: body.mediaUrl,
      thumbnail_url: body.thumbnailUrl ?? null,
      media_type: body.mediaType,
      caption: (body.caption || "").trim() || null,
      taken_at: body.takenAt || null,
      width: body.width ?? null,
      height: body.height ?? null,
      bulk_id: body.bulkId ?? null,
    })
    .select("id, media_url, thumbnail_url, media_type, caption, created_at, sort_date")
    .maybeSingle();
  if (error || !item) {
    return NextResponse.json({ error: error?.message || "Could not save" }, { status: 500 });
  }

  const tagIds = [...new Set((body.taggedUserIds || []).filter(Boolean))];
  if (tagIds.length) {
    await admin
      .from("v2_gallery_tags")
      .insert(tagIds.map((id) => ({ item_id: item.id, tagged_user_id: id, tagger_id: userId })));
  }

  return NextResponse.json({ item });
}
