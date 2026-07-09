import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/contests:
 *   get:
 *     summary: List contests for an event with participant counts
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Contests list
 *       401:
 *         description: Unauthorized
 */
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

  const { data: contests, error } = await adminClient
    .from("contests")
    .select("*, contest_participants(count), scramble_teams(count)")
    .eq("trip_id", tripId)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const formatted = contests?.map((c) => ({
    id: c.id,
    trip_id: c.trip_id,
    name: c.name,
    contest_type: c.contest_type,
    day_number: c.day_number,
    sort_order: c.sort_order,
    scoring_closed_at: c.scoring_closed_at,
    verified_at: c.verified_at,
    winners_locked_at: c.winners_locked_at,
    tee_sheet_published_at: c.tee_sheet_published_at ?? null,
    bracket_format: c.bracket_format ?? "double-elimination",
    participant_count:
      Array.isArray(c.contest_participants) && c.contest_participants.length > 0
        ? (c.contest_participants[0] as { count: number }).count
        : 0,
    team_count:
      Array.isArray(c.scramble_teams) && c.scramble_teams.length > 0
        ? (c.scramble_teams[0] as { count: number }).count
        : 0,
  }));

  return NextResponse.json({ contests: formatted });
}

/**
 * @swagger
 * /api/admin/contests:
 *   post:
 *     summary: Create a new contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Contest created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, name, contest_type, day_number, sort_order } =
      await request.json();

    if (!trip_id || !name || !contest_type) {
      return NextResponse.json(
        { error: "trip_id, name, and contest_type are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Blanket contests everyone plays auto-enroll the trip roster (issue #137);
    // per-option contests (cornhole/skins/pickem) enroll on opt-in instead.
    const AUTO_ENROLL_TYPES = new Set(["calcutta", "scramble", "ryder_cup"]);

    const { data, error } = await adminClient
      .from("contests")
      .insert({
        trip_id,
        name,
        contest_type,
        day_number: day_number || null,
        sort_order: sort_order || 0,
        auto_enroll_attendees: AUTO_ENROLL_TYPES.has(contest_type),
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ contest: data });
  } catch (error) {
    console.error("Create contest error:", error);
    return NextResponse.json(
      { error: "Failed to create contest" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/contests:
 *   put:
 *     summary: Update a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Contest updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, name, contest_type, day_number, sort_order } =
      await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Contest id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("contests")
      .update({
        name,
        contest_type,
        day_number: day_number || null,
        sort_order: sort_order ?? 0,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update contest error:", error);
    return NextResponse.json(
      { error: "Failed to update contest" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/contests:
 *   delete:
 *     summary: Delete a contest
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Contest deleted
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Contest id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // contest_participants will cascade delete
    const { error } = await adminClient
      .from("contests")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete contest error:", error);
    return NextResponse.json(
      { error: "Failed to delete contest" },
      { status: 500 }
    );
  }
}
