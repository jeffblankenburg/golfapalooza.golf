import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { geocodeAddress } from "@/lib/geocode";
import { getEffectiveUserId, getEffectiveTripId } from "@/lib/simulator";
import { checkCourseEditAccess, stampCourseEdit } from "@/lib/courses/edit-access";

// GET - Fetch course with tees and holes. Auth-only — any signed-in user
// can read course detail (consistent with the round detail page, where the
// same data already surfaces).
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

  const admin = createAdminClient();
  const { data: course, error } = await admin
    .from("courses")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!course) {
    return NextResponse.json({ error: "Course not found" }, { status: 404 });
  }

  const { data: tees } = await admin
    .from("course_tees")
    .select("*")
    .eq("course_id", id)
    .order("course_rating", { ascending: false });

  const selectedTeeId = teeId || tees?.[0]?.id;

  let holes: Array<{ id: string; hole_number: number; overhead_image_url: string | null; green_image_url: string | null }> = [];
  if (selectedTeeId) {
    const { data } = await admin
      .from("course_holes")
      .select("*")
      .eq("tee_id", selectedTeeId)
      .order("hole_number");
    holes = data || [];

    // Image backfill: pull missing hole photos in from sibling tees so the
    // editor doesn't render empty placeholders when one tee has all the
    // photos and the others don't.
    if (holes.length > 0) {
      const missingNumbers = holes
        .filter((h) => !h.overhead_image_url || !h.green_image_url)
        .map((h) => h.hole_number);
      if (missingNumbers.length > 0) {
        const { data: siblings } = await admin
          .from("course_holes")
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
          if (!hole.overhead_image_url && imgs.overhead) {
            patch.overhead_image_url = imgs.overhead;
            hole.overhead_image_url = imgs.overhead;
          }
          if (!hole.green_image_url && imgs.green) {
            patch.green_image_url = imgs.green;
            hole.green_image_url = imgs.green;
          }
          if (Object.keys(patch).length > 0) {
            await admin.from("course_holes").update(patch).eq("id", hole.id);
          }
        }
      }
    }
  }

  const tripId = await getEffectiveTripId();
  const adminUser = await checkIsAdmin();

  return NextResponse.json({
    course,
    tees: tees || [],
    holes,
    selected_tee_id: selectedTeeId,
    trip_id: tripId,
    is_admin: !!adminUser,
  });
}

// PUT - Update course details. Issue #133: gated by `checkCourseEditAccess`
// so any signed-in user can edit unlocked courses and admins can edit
// anything. Stamps `updated_at` + `updated_by` so the detail page can show
// "Last edited by …".
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const effectiveUserId = await getEffectiveUserId(user.id);

  const { id } = await params;

  const access = await checkCourseEditAccess(id);
  if (!access.allowed) {
    return NextResponse.json(
      { error: access.reason === "not_found" ? "Course not found" : "Course is locked" },
      { status: access.reason === "not_found" ? 404 : 403 },
    );
  }

  try {
    const body = await request.json();
    const {
      name, club_name, city, state, address, phone, website,
      hole_count, latitude, longitude,
      tee_id, tee_name, tee_color, course_rating, slope_rating, par,
    } = body;

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
      updated_by: effectiveUserId,
    };
    if (name !== undefined) updateData.name = name;
    if (club_name !== undefined) updateData.club_name = club_name?.trim() ? club_name.trim() : null;
    if (city !== undefined) updateData.city = city || null;
    if (state !== undefined) updateData.state = state || null;
    if (address !== undefined) {
      // Strip city/state/zip suffix so address column only holds the street.
      updateData.address = address ? (address.split(",")[0]?.trim() || null) : null;
    }
    if (phone !== undefined) updateData.phone = phone || null;
    if (website !== undefined) updateData.website = website || null;
    if (hole_count !== undefined) updateData.hole_count = hole_count || 18;
    if (latitude !== undefined) updateData.latitude = latitude;
    if (longitude !== undefined) updateData.longitude = longitude;

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

    const admin = createAdminClient();
    const { error } = await admin.from("courses").update(updateData).eq("id", id);
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optional inline tee update — same payload shape the admin endpoint used.
    if (tee_id) {
      const teeUpdates: Record<string, unknown> = {};
      if (tee_name !== undefined) teeUpdates.tee_name = tee_name || "White";
      if (tee_color !== undefined) teeUpdates.tee_color = tee_color || null;
      if (course_rating !== undefined) teeUpdates.course_rating = course_rating || 72.0;
      if (slope_rating !== undefined) teeUpdates.slope_rating = slope_rating || 113;
      if (par !== undefined) teeUpdates.par = par || 72;
      if (Object.keys(teeUpdates).length > 0) {
        const { error: teeError } = await admin
          .from("course_tees")
          .update(teeUpdates)
          .eq("id", tee_id);
        if (teeError) {
          return NextResponse.json({ error: teeError.message }, { status: 500 });
        }
      }
    }

    await stampCourseEdit(id, effectiveUserId);
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
