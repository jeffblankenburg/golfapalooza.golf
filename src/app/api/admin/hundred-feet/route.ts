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

  const [scoresResult, participantsResult] = await Promise.all([
    adminClient
      .from("hundred_feet_scores")
      .select("*, user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
    adminClient
      .from("event_participants")
      .select("user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
  ]);

  if (scoresResult.error) {
    return NextResponse.json({ error: scoresResult.error.message }, { status: 500 });
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

  return NextResponse.json({ scores: scoresResult.data, participants });
}

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, scores } = await request.json();

    if (!trip_id || !scores || !Array.isArray(scores)) {
      return NextResponse.json(
        { error: "trip_id and scores array are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const rows = scores.map((s: { user_id: string; day_number: number; feet: number; inches: number }) => ({
      trip_id,
      user_id: s.user_id,
      day_number: s.day_number,
      feet: s.feet,
      inches: s.inches,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await adminClient
      .from("hundred_feet_scores")
      .upsert(rows, { onConflict: "trip_id,user_id,day_number" });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update hundred feet error:", error);
    return NextResponse.json({ error: "Failed to update scores" }, { status: 500 });
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

  const dayNumber = searchParams.get("day_number");
  const adminClient = createAdminClient();

  let query = adminClient
    .from("hundred_feet_scores")
    .delete()
    .eq("trip_id", tripId);

  if (dayNumber) {
    query = query.eq("day_number", parseInt(dayNumber, 10));
  }

  const { error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
