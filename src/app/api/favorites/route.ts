import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";

const PREF_KEYS = [
  "notify_round_started",
  "notify_hole_completed",
  "notify_round_completed",
] as const;

type PrefKey = (typeof PREF_KEYS)[number];

function pickPrefs(input: unknown): Partial<Record<PrefKey, boolean>> {
  const out: Partial<Record<PrefKey, boolean>> = {};
  if (input && typeof input === "object") {
    for (const key of PREF_KEYS) {
      const v = (input as Record<string, unknown>)[key];
      if (typeof v === "boolean") out[key] = v;
    }
  }
  return out;
}

/**
 * @swagger
 * /api/favorites:
 *   get:
 *     summary: List the current user's favorited Loozers with notification prefs
 *     tags: [Loozers]
 *     responses:
 *       200:
 *         description: List of favorites
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("user_favorites")
    .select(
      `
      id, favorite_user_id, notify_round_started, notify_hole_completed, notify_round_completed, created_at,
      favorite:users!user_favorites_favorite_user_id_fkey(id, display_name, avatar_url)
    `
    )
    .eq("user_id", effectiveUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const favorites = (data || []).map((f) => ({
    ...f,
    favorite: Array.isArray(f.favorite) ? f.favorite[0] : f.favorite,
  }));

  return NextResponse.json({ favorites });
}

/**
 * @swagger
 * /api/favorites:
 *   post:
 *     summary: Favorite a Loozer (idempotent)
 *     tags: [Loozers]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [favorite_user_id]
 *             properties:
 *               favorite_user_id:
 *                 type: string
 *               preferences:
 *                 type: object
 *     responses:
 *       201:
 *         description: Favorite created or updated
 *       400:
 *         description: Bad request
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

  const body = await request.json();
  const favoriteUserId = body?.favorite_user_id;
  if (!favoriteUserId || typeof favoriteUserId !== "string") {
    return NextResponse.json(
      { error: "favorite_user_id is required" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  if (favoriteUserId === effectiveUserId) {
    return NextResponse.json(
      { error: "You cannot favorite yourself" },
      { status: 400 }
    );
  }

  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { data: favorite, error } = await client
    .from("user_favorites")
    .upsert(
      {
        user_id: effectiveUserId,
        favorite_user_id: favoriteUserId,
        ...pickPrefs(body?.preferences),
      },
      { onConflict: "user_id,favorite_user_id" }
    )
    .select(
      `
      id, favorite_user_id, notify_round_started, notify_hole_completed, notify_round_completed, created_at,
      favorite:users!user_favorites_favorite_user_id_fkey(id, display_name, avatar_url)
    `
    )
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    {
      favorite: {
        ...favorite,
        favorite: Array.isArray(favorite.favorite)
          ? favorite.favorite[0]
          : favorite.favorite,
      },
    },
    { status: 201 }
  );
}
