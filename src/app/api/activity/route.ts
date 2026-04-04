import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const DEV_USER_ID = "fd9c3a4b-e728-4e28-ac12-ed9099e389b5";

/**
 * POST /api/activity — Log a user activity event
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { event_type, page_path, metadata } = body;

  if (!event_type) {
    return NextResponse.json({ error: "event_type is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient.from("activity_log").insert({
    user_id: user.id,
    event_type,
    page_path: page_path || null,
    metadata: metadata || {},
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/**
 * GET /api/activity — Retrieve activity log (dev only)
 * Query params: days (default 7), event_type, user_id, limit (default 200)
 */
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.id !== DEV_USER_ID) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const days = parseInt(searchParams.get("days") || "7", 10);
  const eventType = searchParams.get("event_type");
  const userId = searchParams.get("user_id");
  const limit = parseInt(searchParams.get("limit") || "200", 10);

  const since = new Date();
  since.setDate(since.getDate() - days);

  const adminClient = createAdminClient();
  let query = adminClient
    .from("activity_log")
    .select("id, user_id, event_type, page_path, metadata, created_at, users!inner(display_name)")
    .gte("created_at", since.toISOString())
    .order("created_at", { ascending: false })
    .limit(limit);

  if (eventType) {
    query = query.eq("event_type", eventType);
  }
  if (userId) {
    query = query.eq("user_id", userId);
  }

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Also fetch summary stats
  const { data: stats } = await adminClient.rpc("activity_stats", { since_date: since.toISOString() }).maybeSingle();

  return NextResponse.json({ events: data, stats: stats || null });
}
