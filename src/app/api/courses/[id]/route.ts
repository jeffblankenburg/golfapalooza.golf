import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { geocodeAddress } from "@/lib/geocode";

// GET - Fetch course with tees and holes
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const teeId = searchParams.get("tee_id");

  const { data: course, error } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { data: tees } = await supabase
    .from("course_tees")
    .select("*")
    .eq("course_id", id)
    .order("course_rating", { ascending: false });

  const selectedTeeId = teeId || tees?.[0]?.id;

  let holes: unknown[] = [];
  if (selectedTeeId) {
    const { data } = await supabase
      .from("course_holes")
      .select("*")
      .eq("tee_id", selectedTeeId)
      .order("hole_number");
    holes = data || [];
  }

  return NextResponse.json({
    course,
    tees: tees || [],
    holes,
    selected_tee_id: selectedTeeId,
  });
}

// PUT - Update course details
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { name, city, state, address, phone, website, hole_count, latitude, longitude } = body;

    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (city !== undefined) updateData.city = city || null;
    if (state !== undefined) updateData.state = state || null;
    if (address !== undefined) updateData.address = address || null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (website !== undefined) updateData.website = website || null;
    if (hole_count !== undefined) updateData.hole_count = hole_count || 18;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

    // Auto-geocode when address fields change and no explicit lat/lng provided
    if (latitude === undefined && longitude === undefined &&
        (address !== undefined || city !== undefined || state !== undefined)) {
      const coords = await geocodeAddress({
        address: address ?? undefined,
        city: city ?? undefined,
        state: state ?? undefined,
        name: name ?? undefined,
      });
      if (coords) {
        updateData.latitude = coords[0];
        updateData.longitude = coords[1];
      }
    }

    const { error } = await supabase
      .from("courses")
      .update(updateData)
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
  }
}

// PATCH - Toggle course lock (admin only)
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { locked } = body;

    if (typeof locked !== "boolean") {
      return NextResponse.json({ error: "locked must be a boolean" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("courses")
      .update({ locked })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, locked });
  } catch {
    return NextResponse.json({ error: "Failed to update lock status" }, { status: 500 });
  }
}
