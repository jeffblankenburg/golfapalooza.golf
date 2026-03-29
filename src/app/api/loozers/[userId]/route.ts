import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSimulating } from "@/lib/simulator";

/**
 * @swagger
 * /api/loozers/{userId}:
 *   get:
 *     summary: Get a Loozer's profile with accolades and tagged photos
 *     tags: [Loozers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loozer profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;

  // Get profile
  const { data: profile, error: profileError } = await queryClient
    .from("users")
    .select(
      "id, display_name, full_name, avatar_url, city, state, playing_since, swings, typical_shot, fun_fact, best_shot, occupation"
    )
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Get accolades
  const { data: accolades } = await queryClient
    .from("accolades")
    .select("id, title, trip:trip_settings(trip_year)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  // Get tagged photos (latest 12)
  const { data: taggedRows } = await queryClient
    .from("gallery_tags")
    .select(
      "item:gallery_items(id, media_url, thumbnail_url, media_type, created_at)"
    )
    .eq("tagged_user_id", userId)
    .order("created_at", { ascending: false })
    .limit(12);

  const taggedPhotos = (taggedRows || [])
    .map((row) => {
      const item = Array.isArray(row.item) ? row.item[0] : row.item;
      return item;
    })
    .filter(Boolean);

  return NextResponse.json({
    profile,
    accolades: accolades || [],
    taggedPhotos,
    // Stubs for future
    standings: [],
    scorecards: [],
  });
}
