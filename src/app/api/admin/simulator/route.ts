import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveTripId } from "@/lib/simulator";
import { cloneTrip } from "@/lib/trip-clone";

const SIM_TRIP_COOKIE = "sim-trip-id";

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

export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: effective } = await supabase
    .from("trip_settings")
    .select("sim_date")
    .eq("id", (await getEffectiveTripId())!)
    .maybeSingle();

  // Surface the test event (if any) so the UI can offer enter/exit sim mode.
  const { data: testEvent } = await supabase
    .from("trip_settings")
    .select("id, trip_name, trip_year")
    .eq("status", "test")
    .maybeSingle();

  const cookieStore = await cookies();
  const simUserId = cookieStore.get("sim-user-id")?.value || null;
  const simTripId = cookieStore.get(SIM_TRIP_COOKIE)?.value || null;

  return NextResponse.json({
    simDate: effective?.sim_date || null,
    simUserId,
    simTripId,
    testEvent: testEvent
      ? { id: testEvent.id, trip_name: testEvent.trip_name, trip_year: testEvent.trip_year }
      : null,
  });
}

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = createAdminClient();

  if (body.simDate) {
    await supabase
      .from("trip_settings")
      .update({ sim_date: body.simDate })
      .eq("id", (await getEffectiveTripId())!);
  }

  if (body.simUserId) {
    const cookieStore = await cookies();
    cookieStore.set("sim-user-id", body.simUserId, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
  }

  // Create / re-sync the test event from the real active event (issue
  // #128 + #85). If a test event already exists, it's deleted first so
  // the new clone is a clean mirror of the active event's current shape.
  // Sets sim-trip cookie so admin immediately enters sim mode.
  if (body.createTestEvent || body.resyncTestEvent) {
    // 1. Find the real active event to clone from.
    const { data: activeEvent } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("status", "active")
      .maybeSingle();

    if (!activeEvent) {
      return NextResponse.json(
        {
          error:
            "No active event found to clone from. Create an active event first, or use a bare test event.",
        },
        { status: 400 },
      );
    }

    // 2. Delete any existing test event so the new clone is the only one.
    const { data: existing } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("status", "test")
      .maybeSingle();
    if (existing) {
      await supabase.from("trip_settings").delete().eq("id", existing.id);
    }

    // 3. Clone the active event into a new status='test' trip.
    let testTripId: string;
    try {
      const result = await cloneTrip(supabase, activeEvent.id, { status: "test" });
      testTripId = result.newTripId;
    } catch (err) {
      return NextResponse.json(
        { error: `Failed to clone active event: ${(err as Error).message}` },
        { status: 500 },
      );
    }

    const cookieStore = await cookies();
    cookieStore.set(SIM_TRIP_COOKIE, testTripId, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    return NextResponse.json({ success: true, testTripId });
  }

  // Create a BARE test event (no clone) — fallback for when there's no
  // active event to mirror, or when admin wants to configure from scratch.
  if (body.createBareTestEvent) {
    const { data: existing } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("status", "test")
      .maybeSingle();

    let testTripId: string;
    if (existing) {
      testTripId = existing.id;
    } else {
      const today = new Date();
      const yyyy = today.getFullYear();
      const mm = String(today.getMonth() + 1).padStart(2, "0");
      const dd = String(today.getDate()).padStart(2, "0");
      const startDate = `${yyyy}-${mm}-${dd}`;

      const { data: created, error } = await supabase
        .from("trip_settings")
        .insert({
          trip_name: "🧪 Test Event",
          trip_year: yyyy,
          start_date: startDate,
          status: "test",
        })
        .select("id")
        .single();

      if (error || !created) {
        return NextResponse.json(
          { error: error?.message || "Failed to create test event" },
          { status: 500 },
        );
      }
      testTripId = created.id;
    }

    const cookieStore = await cookies();
    cookieStore.set(SIM_TRIP_COOKIE, testTripId, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });

    return NextResponse.json({ success: true, testTripId });
  }

  // Explicit "enter sim mode" — set the cookie to the existing test event.
  if (body.enterSimMode) {
    const { data: testEvent } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("status", "test")
      .maybeSingle();
    if (!testEvent) {
      return NextResponse.json(
        { error: "No test event exists. Create one first." },
        { status: 404 },
      );
    }
    const cookieStore = await cookies();
    cookieStore.set(SIM_TRIP_COOKIE, testEvent.id, {
      path: "/",
      sameSite: "lax",
      httpOnly: false,
    });
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const clearDate = body.clearDate ?? true;
  const clearUser = body.clearUser ?? true;
  const clearTrip = body.clearTrip ?? false;

  if (clearDate) {
    const supabase = createAdminClient();
    await supabase
      .from("trip_settings")
      .update({ sim_date: null })
      .eq("id", (await getEffectiveTripId())!);
  }

  if (clearUser) {
    const cookieStore = await cookies();
    cookieStore.delete("sim-user-id");
  }

  if (clearTrip) {
    const cookieStore = await cookies();
    cookieStore.delete(SIM_TRIP_COOKIE);
  }

  return NextResponse.json({ success: true });
}
