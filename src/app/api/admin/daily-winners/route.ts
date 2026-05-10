import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { materializeDailyContestWinner } from "@/lib/winners/materialize";

// As of issue #124 Phase F, daily winners live directly on
// `contest_winners` (keyed by per-day contest_id + place=1). The legacy
// `daily_contest_winners` table is dropped. The materializer is still
// called on writes so amount + paid_at fields stay current.

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

  // Pull the per-day contests + their winner rows in one shot.
  const [contestsRes, participantsRes] = await Promise.all([
    adminClient
      .from("contests")
      .select(
        "id, contest_type, day_number, contest_winners(user_id, user:users!contest_winners_user_id_fkey(id, display_name, full_name, avatar_url))",
      )
      .eq("trip_id", tripId)
      .in("contest_type", ["ctp_front", "ctp_back", "long_drive", "long_putt"]),
    adminClient
      .from("event_participants")
      .select("user:users(id, display_name, full_name, avatar_url)")
      .eq("trip_id", tripId),
  ]);

  if (contestsRes.error) {
    return NextResponse.json({ error: contestsRes.error.message }, { status: 500 });
  }
  if (participantsRes.error) {
    return NextResponse.json({ error: participantsRes.error.message }, { status: 500 });
  }

  type WinnerRow = { user_id: string };
  const winners: Array<{ day_number: number; contest_type: string; user_id: string }> = [];
  for (const c of contestsRes.data || []) {
    const cwArr = (c.contest_winners ?? []) as WinnerRow[];
    if (cwArr.length === 0 || c.day_number == null) continue;
    winners.push({
      day_number: c.day_number,
      contest_type: c.contest_type,
      user_id: cwArr[0].user_id,
    });
  }

  const participants = (participantsRes.data || [])
    .map((p) => {
      const u = Array.isArray(p.user) ? p.user[0] : p.user;
      const typed = u as { id: string; display_name: string; full_name: string | null; avatar_url: string | null } | null;
      return typed
        ? {
            id: typed.id,
            display_name: typed.display_name || "Unknown",
            full_name: typed.full_name,
            avatar_url: typed.avatar_url,
          }
        : null;
    })
    .filter((p): p is NonNullable<typeof p> => !!p)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));

  return NextResponse.json({ winners, participants });
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
        { status: 400 },
      );
    }

    const adminClient = createAdminClient();

    const { data: contest } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id)
      .eq("day_number", day_number)
      .eq("contest_type", contest_type)
      .maybeSingle();
    if (!contest) {
      return NextResponse.json(
        { error: `No matching contest for day ${day_number} ${contest_type}` },
        { status: 400 },
      );
    }

    // Materialize will compute the right amount + reconcile against any
    // prior winner; it leaves the row's `paid` flag intact when only the
    // amount changes. To swap the user, we clear contest_winners for the
    // contest first, then materialize will re-insert from a fresh source.
    // Simpler approach: write the source-of-truth row directly here and
    // let materialize handle amount.
    await adminClient
      .from("contest_winners")
      .delete()
      .eq("contest_id", contest.id);

    const { error: insErr } = await adminClient.from("contest_winners").insert({
      contest_id: contest.id,
      user_id,
      place: 1,
      determined_by: "manual",
    });
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });

    // Recompute amount via the materializer (which uses contest pot ×
    // payout_splits). The materializer's reconcile preserves the
    // (place, user_id) row we just inserted and only patches its amount.
    await materializeDailyContestWinner(adminClient, contest.id).catch((err) => {
      console.error("materializeDailyContestWinner failed:", err);
    });

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

  // Get every per-day contest for the trip, then clear contest_winners
  // for those contests in one delete.
  const { data: contests } = await adminClient
    .from("contests")
    .select("id")
    .eq("trip_id", tripId)
    .in("contest_type", ["ctp_front", "ctp_back", "long_drive", "long_putt"]);
  const contestIds = (contests || []).map((c) => c.id);
  if (contestIds.length === 0) return NextResponse.json({ success: true });

  const { error } = await adminClient
    .from("contest_winners")
    .delete()
    .in("contest_id", contestIds);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
