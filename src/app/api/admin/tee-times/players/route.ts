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

// POST - Add a player to a tee time group
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tee_time_id, user_id } = await request.json();

    if (!tee_time_id || !user_id) {
      return NextResponse.json(
        { error: "tee_time_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Look up the group's trip_id and day_number
    const { data: group } = await adminClient
      .from("tee_times")
      .select("trip_id, day_number")
      .eq("id", tee_time_id)
      .single();

    if (!group) {
      return NextResponse.json({ error: "Tee time group not found" }, { status: 404 });
    }

    // Check player isn't already in another group for the same day
    const { data: otherGroups } = await adminClient
      .from("tee_times")
      .select("id")
      .eq("trip_id", group.trip_id)
      .eq("day_number", group.day_number)
      .neq("id", tee_time_id);

    if (otherGroups && otherGroups.length > 0) {
      const otherGroupIds = otherGroups.map((g) => g.id);
      const { data: existing } = await adminClient
        .from("tee_time_players")
        .select("id")
        .in("tee_time_id", otherGroupIds)
        .eq("user_id", user_id);

      if (existing && existing.length > 0) {
        return NextResponse.json(
          { error: "Player is already in another group for this day" },
          { status: 400 }
        );
      }
    }

    const { error } = await adminClient
      .from("tee_time_players")
      .insert({ tee_time_id, user_id });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add tee time player error:", error);
    return NextResponse.json({ error: "Failed to add player" }, { status: 500 });
  }
}

// DELETE - Remove a player from a tee time group
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { tee_time_id, user_id } = await request.json();

    if (!tee_time_id || !user_id) {
      return NextResponse.json(
        { error: "tee_time_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("tee_time_players")
      .delete()
      .eq("tee_time_id", tee_time_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove tee time player error:", error);
    return NextResponse.json({ error: "Failed to remove player" }, { status: 500 });
  }
}
