import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function checkIsAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", user.id)
    .single();

  if (!profile?.is_admin) return null;
  return user;
}

/**
 * POST - Batch create pool pairs for multiple players on a team
 * Body: { team_id: string, user_ids: string[], create_real_pairs?: number }
 * Creates a sort_order=0 pool pair for each user_id, assigns them as player_a.
 * Optionally creates `create_real_pairs` empty pair cards (sort_order > 0).
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { team_id, user_ids, create_real_pairs } = await request.json();

    if (!team_id || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json(
        { error: "team_id and user_ids[] are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Batch insert pool pairs (sort_order=0)
    const poolRows = user_ids.map((uid: string) => ({
      team_id,
      sort_order: 0,
      player_a_id: uid,
    }));

    const { error: poolError } = await adminClient
      .from("ryder_cup_pairs")
      .insert(poolRows);

    if (poolError) {
      return NextResponse.json({ error: poolError.message }, { status: 500 });
    }

    // Optionally create empty real pair cards
    if (create_real_pairs && create_real_pairs > 0) {
      const { data: existing } = await adminClient
        .from("ryder_cup_pairs")
        .select("sort_order")
        .eq("team_id", team_id)
        .gt("sort_order", 0)
        .order("sort_order", { ascending: false })
        .limit(1);

      const startOrder = (existing?.[0]?.sort_order ?? 0) + 1;

      const realRows = Array.from({ length: create_real_pairs }, (_, i) => ({
        team_id,
        sort_order: startOrder + i,
      }));

      const { error: realError } = await adminClient
        .from("ryder_cup_pairs")
        .insert(realRows);

      if (realError) {
        return NextResponse.json({ error: realError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true, count: user_ids.length });
  } catch (error) {
    console.error("Batch create ryder cup pairs error:", error);
    return NextResponse.json({ error: "Failed to batch create pairs" }, { status: 500 });
  }
}
