import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

/**
 * @swagger
 * /api/admin/handicaps:
 *   get:
 *     summary: Get event handicap snapshots for a trip
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of player handicap snapshots
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Fetch roster participants for this trip. on_roster=true is the single source
  // for "who's attending" — a user can have an event_participants row (even with a
  // likelihood %) without being on the roster, so filter on on_roster, not likelihood.
  const { data: participants } = await admin
    .from("event_participants")
    .select("user_id, user:users!inner(id, display_name, full_name)")
    .eq("trip_id", tripId)
    .eq("on_roster", true);

  const playerIds = (participants || []).map((p) => p.user_id);

  // Fetch current live handicaps
  const { data: liveHandicaps } = playerIds.length > 0
    ? await admin
        .from("player_handicaps")
        .select("user_id, handicap_index")
        .in("user_id", playerIds)
    : { data: [] };

  const liveMap = new Map<string, number | null>();
  for (const h of liveHandicaps || []) {
    liveMap.set(h.user_id, h.handicap_index);
  }

  // Fetch existing snapshots
  const { data: snapshots } = await admin
    .from("event_player_handicaps")
    .select("user_id, handicap_index, locked_at")
    .eq("trip_id", tripId);

  const snapshotMap = new Map<string, { handicap_index: number | null; locked_at: string }>();
  for (const s of snapshots || []) {
    snapshotMap.set(s.user_id, {
      handicap_index: s.handicap_index,
      locked_at: s.locked_at,
    });
  }

  const players = (participants || []).map((p) => {
    const user = Array.isArray(p.user) ? p.user[0] : p.user;
    const snapshot = snapshotMap.get(p.user_id);
    return {
      user_id: p.user_id,
      display_name: (user as { display_name: string })?.display_name || "Unknown",
      full_name: (user as { full_name: string | null })?.full_name || null,
      live_handicap: liveMap.get(p.user_id) ?? null,
      locked_handicap: snapshot?.handicap_index ?? null,
      locked_at: snapshot?.locked_at ?? null,
      is_locked: !!snapshot,
    };
  });

  return NextResponse.json({ players });
}

/**
 * @swagger
 * /api/admin/handicaps:
 *   post:
 *     summary: Lock handicaps for all trip participants
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trip_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Handicaps locked
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trip_id } = await request.json();
  if (!trip_id) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Get roster participants (see GET — filter on on_roster, not likelihood)
  const { data: participants } = await admin
    .from("event_participants")
    .select("user_id")
    .eq("trip_id", trip_id)
    .eq("on_roster", true);

  const playerIds = (participants || []).map((p) => p.user_id);
  if (playerIds.length === 0) {
    return NextResponse.json({ error: "No participants found" }, { status: 400 });
  }

  // Fetch current handicaps
  const { data: handicaps } = await admin
    .from("player_handicaps")
    .select("user_id, handicap_index")
    .in("user_id", playerIds);

  const handicapMap = new Map<string, number | null>();
  for (const h of handicaps || []) {
    handicapMap.set(h.user_id, h.handicap_index);
  }

  const now = new Date().toISOString();
  const rows = playerIds.map((uid) => ({
    trip_id,
    user_id: uid,
    handicap_index: handicapMap.get(uid) ?? null,
    locked_at: now,
  }));

  const { error } = await admin
    .from("event_player_handicaps")
    .upsert(rows, { onConflict: "trip_id,user_id" });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, locked_count: rows.length });
}

/**
 * @swagger
 * /api/admin/handicaps:
 *   put:
 *     summary: Override a single player's locked handicap
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trip_id:
 *                 type: string
 *               user_id:
 *                 type: string
 *               handicap_index:
 *                 type: number
 *     responses:
 *       200:
 *         description: Handicap updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trip_id, user_id, handicap_index } = await request.json();
  if (!trip_id || !user_id || handicap_index === undefined) {
    return NextResponse.json(
      { error: "trip_id, user_id, and handicap_index are required" },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("event_player_handicaps")
    .upsert(
      {
        trip_id,
        user_id,
        handicap_index,
        locked_at: new Date().toISOString(),
      },
      { onConflict: "trip_id,user_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

/**
 * @swagger
 * /api/admin/handicaps:
 *   delete:
 *     summary: Unlock (delete) all handicap snapshots for a trip
 *     tags: [Admin]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               trip_id:
 *                 type: string
 *     responses:
 *       200:
 *         description: Handicaps unlocked
 *       401:
 *         description: Unauthorized
 */
export async function DELETE(request: NextRequest) {
  const isAdmin = await checkIsAdmin();
  if (!isAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { trip_id } = await request.json();
  if (!trip_id) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("event_player_handicaps")
    .delete()
    .eq("trip_id", trip_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
