import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/accolades/categories/{category}/winners:
 *   get:
 *     summary: Bundled state for the winners-management UI
 *     description: Returns the category metadata, every trip (so empty years can render), every winner currently assigned, and every user (for the picker). One round-trip per page load.
 *     tags: [Admin]
 *     responses:
 *       200: { description: Bundled state }
 *       401: { description: Unauthorized }
 *       404: { description: Category not found }
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ category: string }> },
) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { category } = await params;
  const adminClient = createAdminClient();

  const [{ data: categoryRow }, { data: trips }, { data: winners }, { data: users }] =
    await Promise.all([
      adminClient
        .from("accolade_categories")
        .select("category, title, short_label, icon, icon_url, description, sort_order")
        .eq("category", category)
        .maybeSingle(),
      adminClient
        .from("trip_settings")
        .select("id, trip_year, trip_name, status")
        .order("trip_year", { ascending: false }),
      adminClient
        .from("accolades")
        .select(
          "id, title, trip_id, user_id, partner_user_id, notes, winner:users!accolades_user_id_fkey(id, display_name, full_name, avatar_url), partner:users!accolades_partner_user_id_fkey(id, display_name, full_name, avatar_url)",
        )
        .eq("category", category),
      adminClient
        .from("users")
        .select("id, display_name, full_name, avatar_url, is_active, is_system, is_financial_only")
        .order("full_name", { nullsFirst: false }),
    ]);

  if (!categoryRow) {
    return NextResponse.json({ error: "Category not found" }, { status: 404 });
  }

  return NextResponse.json({
    category: categoryRow,
    trips: trips ?? [],
    winners: winners ?? [],
    users: users ?? [],
  });
}
