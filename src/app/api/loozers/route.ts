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

  // Resolve the active trip first so we know which roster to consult.
  const { data: activeTrip } = await adminClient
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  const [{ data: users }, { data: bios }, { data: roster }, { data: attendance }] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, full_name, avatar_url, sponsor_id, is_founder, is_financial_only")
      .eq("is_system", false)
      .order("display_name"),
    adminClient
      .from("loozer_bios")
      .select("user_id, content")
      .eq("is_visible", true),
    activeTrip
      ? adminClient
          .from("event_participants")
          .select("user_id")
          .eq("trip_id", activeTrip.id)
          .eq("on_roster", true)
      : Promise.resolve({ data: [] as { user_id: string }[] }),
    adminClient.from("event_attendance").select("user_id"),
  ]);

  const bioUserIds = new Set(
    (bios || []).filter((b) => b.content && b.content.trim().length > 0).map((b) => b.user_id)
  );
  const attendingUserIds = new Set((roster || []).map((r) => r.user_id));
  const attendanceCounts = new Map<string, number>();
  for (const row of attendance || []) {
    attendanceCounts.set(row.user_id, (attendanceCounts.get(row.user_id) || 0) + 1);
  }

  const loozers = (users || []).map((u) => ({
    id: u.id,
    display_name: u.display_name,
    full_name: u.full_name,
    avatar_url: u.avatar_url,
    has_bio: bioUserIds.has(u.id),
    sponsor_id: u.sponsor_id,
    is_founder: u.is_founder,
    is_financial_only: u.is_financial_only,
    is_attending: attendingUserIds.has(u.id),
    events_attended: attendanceCounts.get(u.id) ?? 0,
  }));

  return NextResponse.json({ loozers });
}
