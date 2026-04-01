import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, isSimulating } from "@/lib/simulator";
import { cascadeRemoveFromRoster, addToContestsAndChat } from "@/lib/roster";

/**
 * @swagger
 * /api/rsvp:
 *   get:
 *     summary: Get current user's RSVP status for the active event
 *     tags: [RSVP]
 *     responses:
 *       200:
 *         description: RSVP status
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
    return NextResponse.json({ rsvp: null });
  }

  const simulating = await isSimulating();
  const effectiveUserId = await getEffectiveUserId(user.id);
  const dbClient = simulating ? createAdminClient() : supabase;

  const { data: rsvp } = await dbClient
    .from("event_participants")
    .select("likelihood")
    .eq("trip_id", trip.id)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  return NextResponse.json({ rsvp });
}

/**
 * @swagger
 * /api/rsvp:
 *   post:
 *     summary: Set RSVP likelihood for the active event
 *     tags: [RSVP]
 *     responses:
 *       200:
 *         description: RSVP updated
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
    const { likelihood } = await request.json();

    if (![25, 50, 75, 99].includes(likelihood)) {
      return NextResponse.json(
        { error: "likelihood must be 25, 50, 75, or 99" },
        { status: 400 }
      );
    }

    // Simulator support: save RSVP for the simulated user
    const simulating = await isSimulating();
    const effectiveUserId = await getEffectiveUserId(user.id);
    const dbClient = simulating ? createAdminClient() : supabase;

    const { data: trip } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("status", "active")
      .single();

    if (!trip) {
      return NextResponse.json(
        { error: "No active event" },
        { status: 400 }
      );
    }

    const attending = likelihood === 99;

    // Check if already has an event_participants row
    const { data: existing } = await dbClient
      .from("event_participants")
      .select("id, on_roster")
      .eq("trip_id", trip.id)
      .eq("user_id", effectiveUserId)
      .maybeSingle();

    const wasOnRoster = existing?.on_roster ?? false;

    // Upsert event_participants row (always keep for RSVP tracking)
    const adminClient = createAdminClient();
    if (existing) {
      const { error } = await adminClient
        .from("event_participants")
        .update({ likelihood, on_roster: attending })
        .eq("trip_id", trip.id)
        .eq("user_id", effectiveUserId);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error: insertError } = await adminClient
        .from("event_participants")
        .insert({ trip_id: trip.id, user_id: effectiveUserId, likelihood, on_roster: attending });

      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    if (attending && !wasOnRoster) {
      // Joining the roster: add to all contests + chat
      await addToContestsAndChat(trip.id, effectiveUserId);
    } else if (!attending && wasOnRoster) {
      // Leaving the roster: cascade remove from contests/teams/etc
      await cascadeRemoveFromRoster(trip.id, effectiveUserId);
    }

    return NextResponse.json({ success: true, likelihood });
  } catch (error) {
    console.error("RSVP error:", error);
    return NextResponse.json(
      { error: "Failed to update RSVP" },
      { status: 500 }
    );
  }
}
