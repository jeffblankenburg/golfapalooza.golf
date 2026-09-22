import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import { broadcastIfNewlyLive } from "@/lib/v2/articles";

/**
 * @swagger
 * /api/v2/articles:
 *   get:
 *     tags: [Articles]
 *     summary: List an org's articles (incl. drafts) for admin management
 *     description: Requires the manage_articles permission (or org owner/admin).
 *     parameters:
 *       - in: query
 *         name: orgId
 *         required: true
 *         schema: { type: string }
 *   post:
 *     tags: [Articles]
 *     summary: Create an article (draft, scheduled, or published)
 */

const ADMIN_SELECT =
  "id, org_id, event_id, title, content, image_url, image_focal_x, image_focal_y, publish_at, pinned_at, notify_on_publish, view_count, created_at, updated_at, author_id, author:v2_profiles!v2_articles_author_id_fkey(display_name, first_name, last_name, avatar_url)";

/** Clamp a focal coordinate to 0–100 (default 50). */
function focal(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const orgId = url.searchParams.get("orgId");
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_articles"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const { data, error } = await admin
    .from("v2_articles")
    .select(ADMIN_SELECT)
    .eq("org_id", orgId)
    .order("publish_at", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ articles: data ?? [] });
}

export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    orgId?: string;
    event_id?: string | null;
    title?: string;
    content?: string;
    image_url?: string | null;
    image_focal_x?: number;
    image_focal_y?: number;
    publish_at?: string | null;
    notify_on_publish?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const orgId = body.orgId;
  if (!orgId) return NextResponse.json({ error: "orgId required" }, { status: 400 });
  const title = (body.title || "").trim();
  if (!title) return NextResponse.json({ error: "A title is required" }, { status: 400 });

  const admin = v2AdminClient();
  if (!(await hasPermission(admin, userId, orgId, "manage_articles"))) {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }

  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("v2_articles")
    .insert({
      org_id: orgId,
      event_id: body.event_id ?? null,
      author_id: userId,
      title,
      content: body.content ?? "",
      image_url: body.image_url ?? null,
      image_focal_x: focal(body.image_focal_x),
      image_focal_y: focal(body.image_focal_y),
      publish_at: body.publish_at ?? null,
      notify_on_publish: body.notify_on_publish ?? true,
      created_at: nowIso,
      updated_at: nowIso,
    })
    .select("id")
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // If it's created already-live, broadcast (activity feed always; push if opted in).
  await broadcastIfNewlyLive(admin, data.id);

  return NextResponse.json({ id: data.id });
}
