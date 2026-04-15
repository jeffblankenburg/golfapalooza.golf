import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

// GET - Get view counts and readers for articles
export async function GET(request: NextRequest) {
  const isAdmin = await checkPermissionAccess("manage_articles");
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const articleId = searchParams.get("article_id");
  const tripId = searchParams.get("trip_id");

  const admin = createAdminClient();

  // Single article detail: who read it and when
  if (articleId) {
    const { data: views } = await admin
      .from("article_views")
      .select("viewed_at, user:users!inner(id, display_name, avatar_url)")
      .eq("article_id", articleId)
      .order("viewed_at", { ascending: false });

    const readers = (views || []).map((v) => {
      const user = Array.isArray(v.user) ? v.user[0] : v.user;
      return {
        user_id: (user as { id: string }).id,
        display_name: (user as { display_name: string }).display_name,
        avatar_url: (user as { avatar_url: string | null }).avatar_url,
        viewed_at: v.viewed_at,
      };
    });

    return NextResponse.json({ readers, count: readers.length });
  }

  // All articles for a trip: just counts
  if (tripId) {
    const { data: articles } = await admin
      .from("articles")
      .select("id")
      .eq("trip_id", tripId);

    const articleIds = (articles || []).map((a) => a.id);
    if (articleIds.length === 0) {
      return NextResponse.json({ counts: {} });
    }

    const { data: views } = await admin
      .from("article_views")
      .select("article_id")
      .in("article_id", articleIds);

    const counts: Record<string, number> = {};
    for (const v of views || []) {
      counts[v.article_id] = (counts[v.article_id] || 0) + 1;
    }

    return NextResponse.json({ counts });
  }

  return NextResponse.json({ error: "article_id or trip_id required" }, { status: 400 });
}
