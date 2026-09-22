import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import { broadcastIfNewlyLive } from "@/lib/v2/articles";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * @swagger
 * /api/v2/articles/{id}:
 *   get:
 *     tags: [Articles]
 *     summary: Get one article (incl. drafts) for editing
 *   put:
 *     tags: [Articles]
 *     summary: Update an article
 *   delete:
 *     tags: [Articles]
 *     summary: Delete an article
 * Every operation requires manage_articles (or org owner/admin) on the article's org.
 */

function focal(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 50;
  return Math.max(0, Math.min(100, Math.round(n)));
}

/** Load the article's org and confirm the caller can manage it. */
async function guard(
  request: Request,
  articleId: string,
): Promise<
  | { admin: SupabaseClient; userId: string; orgId: string }
  | { error: string; status: 401 | 403 | 404 }
> {
  const { userId } = await v2GetUser(request);
  if (!userId) return { error: "Not authenticated", status: 401 };
  const admin = v2AdminClient();
  const { data: row } = await admin
    .from("v2_articles")
    .select("org_id")
    .eq("id", articleId)
    .maybeSingle();
  if (!row) return { error: "Not found", status: 404 };
  if (!(await hasPermission(admin, userId, row.org_id, "manage_articles"))) {
    return { error: "Not allowed", status: 403 };
  }
  return { admin, userId, orgId: row.org_id };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  const { data, error } = await g.admin
    .from("v2_articles")
    .select(
      "id, org_id, event_id, title, content, image_url, image_focal_x, image_focal_y, publish_at, pinned_at, notify_on_publish, view_count, created_at, updated_at, author_id",
    )
    .eq("id", id)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ article: data });
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  let body: {
    title?: string;
    content?: string;
    image_url?: string | null;
    image_focal_x?: number;
    image_focal_y?: number;
    publish_at?: string | null;
    event_id?: string | null;
    pinned?: boolean;
    notify_on_publish?: boolean;
    author_id?: string | null;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.pinned !== undefined) patch.pinned_at = body.pinned ? new Date().toISOString() : null;
  if (body.notify_on_publish !== undefined) patch.notify_on_publish = body.notify_on_publish;
  if (body.author_id !== undefined) patch.author_id = body.author_id;
  if (body.title !== undefined) {
    const t = (body.title || "").trim();
    if (!t) return NextResponse.json({ error: "A title is required" }, { status: 400 });
    patch.title = t;
  }
  if (body.content !== undefined) patch.content = body.content ?? "";
  if (body.image_url !== undefined) patch.image_url = body.image_url;
  if (body.image_focal_x !== undefined) patch.image_focal_x = focal(body.image_focal_x);
  if (body.image_focal_y !== undefined) patch.image_focal_y = focal(body.image_focal_y);
  if (body.publish_at !== undefined) patch.publish_at = body.publish_at;
  if (body.event_id !== undefined) patch.event_id = body.event_id;

  const { error } = await g.admin.from("v2_articles").update(patch).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // A draft/scheduled article edited to publish now goes live here.
  await broadcastIfNewlyLive(g.admin, id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const g = await guard(request, id);
  if ("error" in g) return NextResponse.json({ error: g.error }, { status: g.status });

  // Grab the hero + inline images before the row is gone, so we can clean up the
  // storage bucket (v1 left these orphaned).
  const { data: row } = await g.admin
    .from("v2_articles")
    .select("image_url, content")
    .eq("id", id)
    .maybeSingle();

  const { error } = await g.admin.from("v2_articles").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Best-effort: remove any files we own in the v2-articles bucket (hero image +
  // markdown-embedded images/videos). Never let cleanup failure fail the delete.
  if (row) {
    const marker = "/v2-articles/";
    const urls = [row.image_url, ...(row.content || "").match(/https?:\/\/[^\s)"']+/g) || []];
    const paths = [
      ...new Set(
        urls
          .filter((u): u is string => typeof u === "string" && u.includes(marker))
          .map((u) => u.split(marker)[1].split(/[?#]/)[0]),
      ),
    ];
    if (paths.length) {
      try {
        await g.admin.storage.from("v2-articles").remove(paths);
      } catch {
        /* best-effort */
      }
    }
  }

  return NextResponse.json({ ok: true });
}
