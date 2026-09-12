import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { geocodeAddress } from "@/lib/v2/geocode";

/** GET — course + tees + holes for the selected tee (image-backfill from siblings). */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const teeId = searchParams.get("tee_id");

  const admin = v2AdminClient();
  const { data: course, error } = await admin.from("v2_courses").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { data: tees } = await admin
    .from("v2_course_tees")
    .select("*")
    .eq("course_id", id)
    .order("course_rating", { ascending: false });

  const selectedTeeId = teeId || tees?.[0]?.id;

  let holes: Array<{ id: string; hole_number: number; overhead_image_url: string | null; green_image_url: string | null }> = [];
  if (selectedTeeId) {
    const { data } = await admin
      .from("v2_course_holes")
      .select("*")
      .eq("tee_id", selectedTeeId)
      .order("hole_number");
    holes = data || [];

    // Backfill missing hole photos from sibling tees so the editor isn't blank.
    if (holes.length > 0) {
      const missingNumbers = holes
        .filter((h) => !h.overhead_image_url || !h.green_image_url)
        .map((h) => h.hole_number);
      if (missingNumbers.length > 0) {
        const { data: siblings } = await admin
          .from("v2_course_holes")
          .select("hole_number, overhead_image_url, green_image_url")
          .eq("course_id", id)
          .neq("tee_id", selectedTeeId)
          .in("hole_number", missingNumbers);
        const imageMap: Record<number, { overhead?: string; green?: string }> = {};
        for (const sh of siblings || []) {
          if (!imageMap[sh.hole_number]) imageMap[sh.hole_number] = {};
          if (sh.overhead_image_url && !imageMap[sh.hole_number].overhead) imageMap[sh.hole_number].overhead = sh.overhead_image_url;
          if (sh.green_image_url && !imageMap[sh.hole_number].green) imageMap[sh.hole_number].green = sh.green_image_url;
        }
        for (const hole of holes) {
          const imgs = imageMap[hole.hole_number];
          if (!imgs) continue;
          const patch: Record<string, string> = {};
          if (!hole.overhead_image_url && imgs.overhead) { patch.overhead_image_url = imgs.overhead; hole.overhead_image_url = imgs.overhead; }
          if (!hole.green_image_url && imgs.green) { patch.green_image_url = imgs.green; hole.green_image_url = imgs.green; }
          if (Object.keys(patch).length > 0) await admin.from("v2_course_holes").update(patch).eq("id", hole.id);
        }
      }
    }
  }

  return NextResponse.json({
    course,
    tees: tees || [],
    holes,
    selected_tee_id: selectedTeeId,
    trip_id: null,
    is_admin: true, // universal edit — everyone can edit any course
  });
}

/** PUT — update course info (universal edit). Stamps updated_by/updated_at. */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const admin = v2AdminClient();

  const { data: exists } = await admin.from("v2_courses").select("id").eq("id", id).maybeSingle();
  if (!exists) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  try {
    const body = await request.json();
    const {
      name, club_name, city, state, address, phone, website,
      hole_count, latitude, longitude,
      tee_id, tee_name, tee_color, course_rating, slope_rating, par,
    } = body;

    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString(), updated_by: userId };
    if (name !== undefined) updateData.name = name;
    if (club_name !== undefined) updateData.club_name = club_name?.trim() ? club_name.trim() : null;
    if (city !== undefined) updateData.city = city || null;
    if (state !== undefined) updateData.state = state || null;
    if (address !== undefined) updateData.address = address ? (address.split(",")[0]?.trim() || null) : null;
    if (phone !== undefined) updateData.phone = phone || null;
    if (website !== undefined) updateData.website = website || null;
    if (hole_count !== undefined) updateData.hole_count = hole_count || 18;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

    if (latitude === undefined && longitude === undefined &&
        (address !== undefined || city !== undefined || state !== undefined)) {
      const coords = await geocodeAddress({ address: address ?? undefined, city: city ?? undefined, state: state ?? undefined, name: name ?? undefined });
      if (coords) { updateData.latitude = coords[0]; updateData.longitude = coords[1]; }
    }

    const { error } = await admin.from("v2_courses").update(updateData).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (tee_id) {
      const teeUpdates: Record<string, unknown> = {};
      if (tee_name !== undefined) teeUpdates.tee_name = tee_name || "White";
      if (tee_color !== undefined) teeUpdates.tee_color = tee_color || null;
      if (course_rating !== undefined) teeUpdates.course_rating = course_rating || null;
      if (slope_rating !== undefined) teeUpdates.slope_rating = slope_rating || null;
      if (par !== undefined) teeUpdates.par = par || 72;
      if (Object.keys(teeUpdates).length > 0) {
        const { error: teeError } = await admin.from("v2_course_tees").update(teeUpdates).eq("id", tee_id);
        if (teeError) return NextResponse.json({ error: teeError.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update course" }, { status: 500 });
  }
}
