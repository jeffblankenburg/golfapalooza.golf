import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/loozers:
 *   get:
 *     summary: List attending Loozers for the active trip
 *     tags: [Loozers]
 *     responses:
 *       200:
 *         description: List of attending Loozers
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

  const adminClient = createAdminClient();

  // Get active trip
  const { data: activeTrip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  if (!activeTrip) {
    return NextResponse.json({ loozers: [] });
  }

  // Get attending participants (on_roster = true)
  const { data: participants } = await adminClient
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", activeTrip.id)
    .eq("on_roster", true);

  if (!participants || participants.length === 0) {
    return NextResponse.json({ loozers: [] });
  }

  const userIds = participants.map((p) => p.user_id);

  // Fetch user profiles and check for bios in parallel
  const [{ data: users }, { data: bios }] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .in("id", userIds)
      .order("display_name"),
    adminClient
      .from("loozer_bios")
      .select("user_id")
      .in("user_id", userIds),
  ]);

  const bioUserIds = new Set(
    (bios || []).map((b) => b.user_id)
  );

  const loozers = (users || []).map((u) => ({
    id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    has_bio: bioUserIds.has(u.id),
  }));

  return NextResponse.json({ loozers });
}
