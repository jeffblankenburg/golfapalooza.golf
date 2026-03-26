import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * @swagger
 * /api/action-items:
 *   get:
 *     summary: Get action items with completion status for current user
 *     tags: [Actions]
 *     responses:
 *       200:
 *         description: Action items with completion status
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

  const { data: trip } = await supabase
    .from("trip_settings")
    .select("id")
    .eq("status", "active")
    .single();

  if (!trip) {
    return NextResponse.json({ items: [], completions: [] });
  }

  const [itemsResult, completionsResult] = await Promise.all([
    supabase
      .from("action_items")
      .select("*")
      .eq("trip_id", trip.id)
      .order("sort_order"),
    supabase
      .from("user_action_completions")
      .select("action_item_id, completed_at")
      .eq("user_id", user.id),
  ]);

  return NextResponse.json({
    items: itemsResult.data || [],
    completions: completionsResult.data || [],
  });
}

/**
 * @swagger
 * /api/action-items:
 *   post:
 *     summary: Toggle action item completion
 *     tags: [Actions]
 *     responses:
 *       200:
 *         description: Completion toggled
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { action_item_id, completed } = await request.json();

    if (!action_item_id || typeof completed !== "boolean") {
      return NextResponse.json(
        { error: "action_item_id and completed (boolean) are required" },
        { status: 400 }
      );
    }

    if (completed) {
      const { error } = await supabase
        .from("user_action_completions")
        .upsert(
          { action_item_id, user_id: user.id },
          { onConflict: "action_item_id,user_id" }
        );

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await supabase
        .from("user_action_completions")
        .delete()
        .eq("action_item_id", action_item_id)
        .eq("user_id", user.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Toggle action completion error:", error);
    return NextResponse.json(
      { error: "Failed to toggle completion" },
      { status: 500 }
    );
  }
}
