import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";

const SELECT = "favorite_user_id, notify_round_started, notify_hole_completed, notify_round_completed";

/**
 * GET — the signed-in user's follows (who they follow + per-follow toggles).
 */
export async function GET(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  const { data, error } = await admin.from("v2_user_favorites").select(SELECT).eq("follower_id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ follows: data || [] });
}

/**
 * POST — follow a member. Body `{ favoriteUserId }`. Idempotent (upsert); new
 * follows default all three spectator notifications on.
 */
export async function POST(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: { favoriteUserId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const favoriteUserId = body.favoriteUserId;
  if (!favoriteUserId) return NextResponse.json({ error: "favoriteUserId required" }, { status: 400 });
  if (favoriteUserId === userId) return NextResponse.json({ error: "You can't follow yourself" }, { status: 400 });

  const admin = v2AdminClient();
  const { data, error } = await admin
    .from("v2_user_favorites")
    .upsert({ follower_id: userId, favorite_user_id: favoriteUserId }, { onConflict: "follower_id,favorite_user_id" })
    .select(SELECT)
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ follow: data });
}

/**
 * PATCH — update per-follow toggles. Body `{ favoriteUserId, notify_round_started?,
 * notify_hole_completed?, notify_round_completed? }`.
 */
export async function PATCH(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let body: {
    favoriteUserId?: string;
    notify_round_started?: boolean;
    notify_hole_completed?: boolean;
    notify_round_completed?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (!body.favoriteUserId) return NextResponse.json({ error: "favoriteUserId required" }, { status: 400 });

  const patch: Record<string, boolean> = {};
  for (const k of ["notify_round_started", "notify_hole_completed", "notify_round_completed"] as const) {
    if (typeof body[k] === "boolean") patch[k] = body[k]!;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: "No fields to update" }, { status: 400 });

  const admin = v2AdminClient();
  const { data, error } = await admin
    .from("v2_user_favorites")
    .update(patch)
    .eq("follower_id", userId)
    .eq("favorite_user_id", body.favoriteUserId)
    .select(SELECT)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not following that member" }, { status: 404 });
  return NextResponse.json({ follow: data });
}

/**
 * DELETE — unfollow. Body or `?favoriteUserId=`.
 */
export async function DELETE(request: Request) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const url = new URL(request.url);
  let favoriteUserId = url.searchParams.get("favoriteUserId") || undefined;
  if (!favoriteUserId) {
    try {
      favoriteUserId = (await request.json())?.favoriteUserId;
    } catch {
      /* body optional */
    }
  }
  if (!favoriteUserId) return NextResponse.json({ error: "favoriteUserId required" }, { status: 400 });

  const admin = v2AdminClient();
  const { error } = await admin
    .from("v2_user_favorites")
    .delete()
    .eq("follower_id", userId)
    .eq("favorite_user_id", favoriteUserId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
