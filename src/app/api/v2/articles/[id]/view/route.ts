import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isOrgMember } from "@/lib/v2/orgs";
import { v2Now } from "@/lib/v2/simulator";

/**
 * @swagger
 * /api/v2/articles/{id}/view:
 *   post:
 *     tags: [Articles]
 *     summary: Record that the caller read this article (deduped per user)
 *     description: >
 *       Idempotent — one row per (article, user). A DB trigger keeps
 *       v2_articles.view_count in step. Only live articles are counted.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data: art } = await admin
    .from("v2_articles")
    .select("org_id, publish_at")
    .eq("id", id)
    .maybeSingle();
  if (!art) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!(await isOrgMember(admin, userId, art.org_id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  // Only count reads of live articles (an admin previewing a draft doesn't count).
  if (art.publish_at && new Date(art.publish_at) <= (await v2Now())) {
    await admin
      .from("v2_article_views")
      .upsert({ article_id: id, user_id: userId }, { onConflict: "article_id,user_id", ignoreDuplicates: true });
  }
  return NextResponse.json({ ok: true });
}
