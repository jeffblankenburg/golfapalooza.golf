import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/loozers/locations:
 *   get:
 *     summary: List Loozers with geocoded coordinates for the map view
 *     tags: [Loozers]
 *     responses:
 *       200:
 *         description: Loozers with non-null latitude/longitude who have opted in
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

  const { data, error } = await adminClient
    .from("users")
    .select("id, display_name, avatar_url, city, state, latitude, longitude")
    .eq("is_system", false)
    .eq("is_financial_only", false)
    .eq("show_on_map", true)
    .not("latitude", "is", null)
    .not("longitude", "is", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ loozers: data || [] });
}
