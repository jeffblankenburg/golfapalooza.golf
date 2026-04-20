import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * @swagger
 * /api/fake-ads:
 *   get:
 *     summary: List active fake ads, optionally filtered to those tagging a specific Loozer
 *     tags: [FakeAds]
 *     parameters:
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *           format: uuid
 *         description: If provided, returns only ads tagged with this user
 *     responses:
 *       200:
 *         description: List of active fake ads (possibly empty)
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");

  const admin = createAdminClient();

  if (userId) {
    const { data: tagRows, error: tagErr } = await admin
      .from("fake_ad_loozers")
      .select("ad_id")
      .eq("user_id", userId);

    if (tagErr) {
      return NextResponse.json({ error: tagErr.message }, { status: 500 });
    }

    const adIds = (tagRows || []).map((r) => r.ad_id);
    if (adIds.length === 0) {
      return NextResponse.json({ ads: [] });
    }

    const { data, error } = await admin
      .from("fake_ads")
      .select("id, image_url, alt_text, sort_order, fake_ad_loozers(user_id)")
      .eq("active", true)
      .in("id", adIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      ads: (data || []).map((ad) => ({
        id: ad.id,
        image_url: ad.image_url,
        alt_text: ad.alt_text,
        tagged_user_ids: ad.fake_ad_loozers?.map((t: { user_id: string }) => t.user_id) || [],
      })),
    });
  }

  const { data, error } = await admin
    .from("fake_ads")
    .select("id, image_url, alt_text, sort_order, fake_ad_loozers(user_id)")
    .eq("active", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ads: (data || []).map((ad) => ({
      id: ad.id,
      image_url: ad.image_url,
      alt_text: ad.alt_text,
      tagged_user_ids: ad.fake_ad_loozers?.map((t: { user_id: string }) => t.user_id) || [],
    })),
  });
}
