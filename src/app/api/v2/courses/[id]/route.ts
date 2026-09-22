import { NextResponse } from "next/server";
import { v2GetUser, v2AdminClient } from "@/lib/v2/supabase";
import { isAnyOrgAdmin } from "@/lib/v2/orgs";
import { courseEditGate } from "@/lib/v2/courses/edit-access";
import { geocodeAddress } from "@/lib/v2/geocode";
import { compareTees } from "@/lib/v2/golf/tees";

const HOLE_SELECT =
  "id, tee_id, hole_number, par, handicap_index, yards, meters, hole_name, tee_latitude, tee_longitude, green_latitude, green_longitude, green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude, drive_latitude, drive_longitude, center_line";

interface HoleRow {
  id: string; tee_id: string; hole_number: number; par: number; handicap_index: number;
  yards: number | null; hole_name: string | null; [k: string]: unknown;
}
interface MapRow { tee_id: string; hole_number: number; source_tee_id: string }

/**
 * GET — the whole course in one shot: course + tees + **every tee's holes**
 * (hybrid tees resolved from their source tees) + composition state. Returning
 * all tees' holes up front lets the client switch tees instantly (no refetch).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { id } = await params;
  const admin = v2AdminClient();
  const { data: course, error } = await admin.from("v2_courses").select("*").eq("id", id).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!course) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const isAdmin = await isAnyOrgAdmin(admin, userId);

  const { data: teeData } = await admin
    .from("v2_course_tees").select("*").eq("course_id", id);
  // Canonical order: men's/unisex (longest first), then women's (longest first).
  const tees = (teeData || []).slice().sort(compareTees);
  const teeIds = tees.map((t) => t.id);

  let allHoles: HoleRow[] = [];
  let maps: MapRow[] = [];
  if (teeIds.length) {
    const [hRes, mRes] = await Promise.all([
      admin.from("v2_course_holes").select(HOLE_SELECT).in("tee_id", teeIds).order("hole_number"),
      admin.from("v2_composition_tee_mappings").select("tee_id, hole_number, source_tee_id").in("tee_id", teeIds).order("hole_number"),
    ]);
    allHoles = (hRes.data as HoleRow[] | null) || [];
    maps = (mRes.data as MapRow[] | null) || [];
  }

  // Index own holes + the composition mappings.
  const ownByTee: Record<string, HoleRow[]> = {};
  const holeByKey = new Map<string, HoleRow>();
  for (const h of allHoles) {
    (ownByTee[h.tee_id] ||= []).push(h);
    holeByKey.set(`${h.tee_id}|${h.hole_number}`, h);
  }
  const mapByTee: Record<string, MapRow[]> = {};
  for (const m of maps) (mapByTee[m.tee_id] ||= []).push(m);
  const compositionTeeIds = Object.keys(mapByTee);

  // Resolve every tee's holes (hybrids pull each hole from its source tee).
  const holesByTee: Record<string, HoleRow[]> = {};
  for (const tee of tees) {
    const m = mapByTee[tee.id];
    if (m && m.length) {
      holesByTee[tee.id] = m
        .slice()
        .sort((a, b) => a.hole_number - b.hole_number)
        .map((mm) =>
          holeByKey.get(`${mm.source_tee_id}|${mm.hole_number}`) ?? {
            id: `${tee.id}-${mm.hole_number}`, tee_id: mm.source_tee_id, hole_number: mm.hole_number,
            par: 4, handicap_index: mm.hole_number, yards: null, hole_name: null,
          } as HoleRow,
        );
    } else {
      holesByTee[tee.id] = (ownByTee[tee.id] || []).slice().sort((a, b) => a.hole_number - b.hole_number);
    }
  }

  return NextResponse.json({
    course,
    tees,
    holes_by_tee: holesByTee,
    composition_tee_ids: compositionTeeIds,
    composition_mappings: mapByTee,
    selected_tee_id: tees[0]?.id ?? null,
    is_admin: isAdmin, // universal edit, but the lock toggle is admin-only
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

  const gate = await courseEditGate(admin, id, userId);
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const body = await request.json();
    const {
      name, club_name, city, state, address, phone, website,
      hole_count, latitude, longitude,
      tee_id, tee_name, tee_color, gender, course_rating, slope_rating, par,
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
      if (gender !== undefined) teeUpdates.gender = ["men", "women", "all"].includes(gender) ? gender : "all";
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

/** PATCH — admin-only course flags. Currently just `locked` (freeze/unfreeze the
 *  course so non-admins can't edit it). Group admins only, like DELETE. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isAnyOrgAdmin(admin, userId))) {
    return NextResponse.json({ error: "Only group admins can lock or unlock courses" }, { status: 403 });
  }

  let body: { locked?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  if (typeof body.locked !== "boolean") {
    return NextResponse.json({ error: "locked must be a boolean" }, { status: 400 });
  }

  const { data: exists } = await admin.from("v2_courses").select("id").eq("id", id).maybeSingle();
  if (!exists) return NextResponse.json({ error: "Course not found" }, { status: 404 });

  const { error } = await admin
    .from("v2_courses")
    .update({ locked: body.locked, updated_at: new Date().toISOString(), updated_by: userId })
    .eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, locked: body.locked });
}

/** DELETE — remove a course entirely (admins only). Cascades tees / holes /
 *  composition mappings via FK ON DELETE CASCADE. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { userId } = await v2GetUser(request);
  if (!userId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = v2AdminClient();
  if (!(await isAnyOrgAdmin(admin, userId))) {
    return NextResponse.json({ error: "Only group admins can delete courses" }, { status: 403 });
  }

  const { error } = await admin.from("v2_courses").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
