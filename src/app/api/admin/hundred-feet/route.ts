import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { materializeHundredFeetWinners } from "@/lib/winners/materialize";

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

  // Find the 100 Feet contest for this trip (contest_type = 'other', name = '100 Feet!')
  const { data: hundredFeetContest } = await adminClient
    .from("contests")
    .select("id")
    .eq("trip_id", tripId)
    .eq("name", "100 Feet!")
    .eq("contest_type", "other")
    .maybeSingle();

  const contestId = hundredFeetContest?.id || null;

  const [scoresResult, participantsResult, contestParticipantsResult] = await Promise.all([
    adminClient
      .from("hundred_feet_scores")
      .select("*, user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
    adminClient
      .from("event_participants")
      .select("user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
    contestId
      ? adminClient
          .from("contest_participants")
          .select("user_id")
          .eq("contest_id", contestId)
      : Promise.resolve({ data: [] as { user_id: string }[], error: null }),
  ]);

  if (scoresResult.error) {
    return NextResponse.json({ error: scoresResult.error.message }, { status: 500 });
  }
  if (participantsResult.error) {
    return NextResponse.json({ error: participantsResult.error.message }, { status: 500 });
  }

  const participants = (participantsResult.data || []).map((p) => {
    const u = Array.isArray(p.user) ? p.user[0] : p.user;
    const typed = u as unknown as { id: string; display_name: string; full_name: string | null; avatar_url: string | null } | null;
    return {
      id: typed?.id,
      display_name: typed?.display_name || "Unknown",
      full_name: typed?.full_name || null,
      avatar_url: typed?.avatar_url || null,
    };
  }).sort((a, b) => a.display_name.localeCompare(b.display_name));

  const contestParticipantIds = (contestParticipantsResult.data || []).map((cp) => cp.user_id);

  return NextResponse.json({
    scores: scoresResult.data,
    participants,
    contest_id: contestId,
    contest_participant_ids: contestParticipantIds,
  });
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

    // Issue #124: re-materialize the 100 Feet contest's winner whenever
    // any score changes. Lowest cumulative wins, so a single new score
    // can shift the leader.
    const { data: hundredFeetContest } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id)
      .eq("name", "100 Feet!")
      .eq("contest_type", "other")
      .maybeSingle();
    if (hundredFeetContest?.id) {
      await materializeHundredFeetWinners(adminClient, hundredFeetContest.id).catch((err) => {
        console.error("materializeHundredFeetWinners failed:", err);
      });
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
