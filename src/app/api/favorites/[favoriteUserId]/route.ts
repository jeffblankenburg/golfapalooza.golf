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

/**
 * @swagger
 * /api/favorites/{favoriteUserId}:
 *   put:
 *     summary: Update notification preferences for a favorited Loozer
 *     tags: [Loozers]
 *     parameters:
 *       - in: path
 *         name: favoriteUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Preferences updated
 *       400:
 *         description: No valid preferences supplied
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Favorite not found
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ favoriteUserId: string }> }
) {
  const { favoriteUserId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const updates: Partial<Record<PrefKey, boolean>> = {};
  for (const key of PREF_KEYS) {
    if (typeof body?.[key] === "boolean") updates[key] = body[key];
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { error: "No valid preferences supplied" },
      { status: 400 }
    );
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { data, error } = await client
    .from("user_favorites")
    .update(updates)
    .eq("user_id", effectiveUserId)
    .eq("favorite_user_id", favoriteUserId)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Favorite not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

/**
 * @swagger
 * /api/favorites/{favoriteUserId}:
 *   delete:
 *     summary: Unfavorite a Loozer
 *     tags: [Loozers]
 *     parameters:
 *       - in: path
 *         name: favoriteUserId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Unfavorited
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ favoriteUserId: string }> }
) {
  const { favoriteUserId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const simulating = await isSimulating();
  const client = simulating ? createAdminClient() : supabase;

  const { error } = await client
    .from("user_favorites")
    .delete()
    .eq("user_id", effectiveUserId)
    .eq("favorite_user_id", favoriteUserId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
