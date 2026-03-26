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

export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripIdParam = searchParams.get("trip_id");

  const adminClient = createAdminClient();

  // Resolve trip: use provided trip_id or fall back to active trip
  let trip: { id: string; start_date: string } | null = null;

  if (tripIdParam) {
    const { data } = await adminClient
      .from("trip_settings")
      .select("id, start_date")
      .eq("id", tripIdParam)
      .single();
    trip = data;
  } else {
    const { data } = await adminClient
      .from("trip_settings")
      .select("id, start_date")
      .eq("status", "active")
      .single();
    trip = data;
  }

  if (!trip) {
    return NextResponse.json({ error: "No trip configured" }, { status: 404 });
  }

  const { data: items, error } = await adminClient
    .from("itinerary_items")
    .select("*")
    .eq("trip_id", trip.id)
    .order("day_number", { ascending: true, nullsFirst: true })
    .order("sort_order", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items, tripId: trip.id, startDate: trip.start_date });
}

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { trip_id, title, location, day_number, start_date, start_time, end_date, end_time, sort_order } = body;

    if (!trip_id || !title) {
      return NextResponse.json({ error: "Trip ID and title are required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("itinerary_items")
      .insert({
        trip_id,
        title,
        location: location || null,
        day_number: day_number ?? null,
        start_date: start_date || null,
        start_time: start_time || null,
        end_date: end_date || null,
        end_time: end_time || null,
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("Create itinerary item error:", error);
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { id, title, location, day_number, start_date, start_time, end_date, end_time, sort_order } = body;

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("itinerary_items")
      .update({
        title,
        location: location || null,
        day_number: day_number ?? null,
        start_date: start_date || null,
        start_time: start_time || null,
        end_date: end_date || null,
        end_time: end_time || null,
        sort_order: sort_order ?? 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update itinerary item error:", error);
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "Item ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("itinerary_items")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete itinerary item error:", error);
    return NextResponse.json({ error: "Failed to delete item" }, { status: 500 });
  }
}
