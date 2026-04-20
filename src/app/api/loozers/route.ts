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

  // Fetch all users and check for bios in parallel
  const [{ data: users }, { data: bios }] = await Promise.all([
    adminClient
      .from("users")
      .select("id, display_name, avatar_url")
      .eq("is_financial_only", false)
      .order("display_name"),
    adminClient
      .from("loozer_bios")
      .select("user_id, content"),
  ]);

  const bioUserIds = new Set(
    (bios || []).filter((b) => b.content && b.content.trim().length > 0).map((b) => b.user_id)
  );

  const loozers = (users || []).map((u) => ({
    id: u.id,
    display_name: u.display_name,
    avatar_url: u.avatar_url,
    has_bio: bioUserIds.has(u.id),
  }));

  return NextResponse.json({ loozers });
}
