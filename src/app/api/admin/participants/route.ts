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
 * @swagger
 * /api/admin/participants:
 *   get:
 *     summary: List all users with participation status for an event
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Users with participation status
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const tripId = searchParams.get("trip_id");

    if (!tripId) {
      return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();

    // Get all users
    const { data: users, error: usersError } = await adminClient
      .from("users")
      .select("id, display_name, full_name, avatar_url")
      .order("display_name");

    if (usersError) {
      return NextResponse.json({ error: usersError.message }, { status: 500 });
    }

    // Get participants for this event (try with likelihood, fall back without)
    let participantMap = new Map<string, number | null>();

    const { data: participants, error: partError } = await adminClient
      .from("event_participants")
      .select("user_id, likelihood")
      .eq("trip_id", tripId);

    if (partError) {
      // likelihood column may not exist yet — fall back to user_id only
      const { data: fallback } = await adminClient
        .from("event_participants")
        .select("user_id")
        .eq("trip_id", tripId);

      participantMap = new Map(
        fallback?.map((p) => [p.user_id, null]) || []
      );
    } else {
      participantMap = new Map(
        participants?.map((p) => [p.user_id, (p as Record<string, unknown>).likelihood as number | null]) || []
      );
    }

    const usersWithStatus = users?.map((u) => ({
      ...u,
      is_participating: participantMap.has(u.id),
      likelihood: participantMap.get(u.id) ?? null,
    }));

    return NextResponse.json({ users: usersWithStatus });
  } catch (error) {
    console.error("Get participants error:", error);
    return NextResponse.json(
      { error: "Failed to load participants" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/participants:
 *   post:
 *     summary: Add participant to event and all contests
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant added
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, user_id } = await request.json();

    if (!trip_id || !user_id) {
      return NextResponse.json(
        { error: "trip_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Add to event participants
    const { error: insertError } = await adminClient
      .from("event_participants")
      .upsert({ trip_id, user_id }, { onConflict: "trip_id,user_id" });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    // Auto-add to all contests for this event
    const { data: contests } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id);

    if (contests && contests.length > 0) {
      const contestEntries = contests.map((c) => ({
        contest_id: c.id,
        user_id,
      }));

      await adminClient
        .from("contest_participants")
        .upsert(contestEntries, { onConflict: "contest_id,user_id" });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Add participant error:", error);
    return NextResponse.json(
      { error: "Failed to add participant" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/participants:
 *   delete:
 *     summary: Remove participant from event and all contests
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Participant removed
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, user_id } = await request.json();

    if (!trip_id || !user_id) {
      return NextResponse.json(
        { error: "trip_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Get all contest IDs for this trip to remove contest participation
    const { data: contests } = await adminClient
      .from("contests")
      .select("id")
      .eq("trip_id", trip_id);

    if (contests && contests.length > 0) {
      const contestIds = contests.map((c) => c.id);
      await adminClient
        .from("contest_participants")
        .delete()
        .in("contest_id", contestIds)
        .eq("user_id", user_id);
    }

    // Remove from event participants
    const { error } = await adminClient
      .from("event_participants")
      .delete()
      .eq("trip_id", trip_id)
      .eq("user_id", user_id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Remove participant error:", error);
    return NextResponse.json(
      { error: "Failed to remove participant" },
      { status: 500 }
    );
  }
}
