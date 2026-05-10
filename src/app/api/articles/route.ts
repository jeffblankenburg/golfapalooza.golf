import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getEffectiveTripId } from "@/lib/simulator";

// GET - List published articles for the active trip
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  let tripId = searchParams.get("trip_id");
  const limit = parseInt(searchParams.get("limit") || "20", 10);
  const cursor = searchParams.get("cursor");

  // Fall back to active trip
  if (!tripId) {
    const { data: trip } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("id", (await getEffectiveTripId())!)
      .single();
    tripId = trip?.id || null;
  }

  if (!tripId) {
    return NextResponse.json({ articles: [] });
  }

  // RLS ensures only published articles (publish_at <= now()) are returned
  let query = supabase
    .from("articles")
    .select(`
      id, title, content, publish_at, created_at,
      author:users!articles_author_id_fkey(id, display_name, avatar_url),
      featured_image:gallery_items!articles_featured_image_id_fkey(id, media_url, thumbnail_url)
    `)
    .eq("trip_id", tripId)
    .order("publish_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("publish_at", cursor);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ articles: data || [] });
}
