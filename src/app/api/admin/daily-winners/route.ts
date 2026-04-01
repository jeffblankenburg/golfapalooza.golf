import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const [winnersResult, participantsResult] = await Promise.all([
    adminClient
      .from("daily_contest_winners")
      .select("*, user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
    adminClient
      .from("event_participants")
      .select("user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
  ]);

  if (winnersResult.error) {
    return NextResponse.json({ error: winnersResult.error.message }, { status: 500 });
  }
  if (participantsResult.error) {
    return NextResponse.json({ error: participantsResult.error.message }, { status: 500 });
  }

  const participants = (participantsResult.data || []).map((p) => {
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    return {
      id: u?.id,
      display_name: u?.display_name || "Unknown",
      full_name: u?.full_name || null,
      avatar_url: u?.avatar_url || null,
    };
  }).sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ winners: winnersResult.data, participants });
}

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, day_number, contest_type, user_id } = await request.json();

    if (!trip_id || !day_number || !contest_type || !user_id) {
      return NextResponse.json(
        { error: "trip_id, day_number, contest_type, and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("daily_contest_winners")
      .upsert(
        {
          trip_id,
          day_number,
          contest_type,
          user_id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "trip_id,day_number,contest_type" }
      );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update daily winner error:", error);
    return NextResponse.json({ error: "Failed to update winner" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { error } = await adminClient
    .from("daily_contest_winners")
    .delete()
    .eq("trip_id", tripId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
