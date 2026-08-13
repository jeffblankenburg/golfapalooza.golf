import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkPermissionAccess } from "@/lib/permissions-server";

const SHIRT_PERMISSION = "manage_event_settings";

/** Extract the storage path from a gallery-media public URL */
function extractStoragePath(url: string): string | null {
  const marker = "/gallery-media/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

/** Delete an uploaded shirt photo from storage (best-effort) */
async function cleanupImage(admin: ReturnType<typeof createAdminClient>, url: string | null) {
  if (!url) return;
  const path = extractStoragePath(url);
  if (path) {
    await admin.storage.from("gallery-media").remove([path]);
  }
}

/**
 * @swagger
 * /api/admin/shirts:
 *   get:
 *     tags: [Admin]
 *     summary: List all shirts for an event (Shirt Guide)
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200: { description: Array of shirts ordered by sort_order }
 *   post:
 *     tags: [Admin]
 *     summary: Create a shirt
 *   put:
 *     tags: [Admin]
 *     summary: Update a shirt
 *   delete:
 *     tags: [Admin]
 *     summary: Delete a shirt (also removes its uploaded photo)
 */

// GET - List all shirts for a trip
export async function GET(request: NextRequest) {
  if (!(await checkPermissionAccess(SHIRT_PERMISSION))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const tripId = new URL(request.url).searchParams.get("trip_id");
  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("event_shirts")
    .select("id, day_label, name, description, image_url, sort_order")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ shirts: data || [] });
}

// POST - Create a shirt
export async function POST(request: NextRequest) {
  if (!(await checkPermissionAccess(SHIRT_PERMISSION))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { trip_id, day_label, name, description, image_url, sort_order } = body;

  if (!trip_id || !day_label?.trim() || !name?.trim()) {
    return NextResponse.json(
      { error: "trip_id, day_label, and name are required" },
      { status: 400 },
    );
  }

  const admin = createAdminClient();

  // Default sort_order to the end of the list when not supplied.
  let order = sort_order;
  if (order === undefined || order === null) {
    const { data: last } = await admin
      .from("event_shirts")
      .select("sort_order")
      .eq("trip_id", trip_id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    order = (last?.sort_order ?? -1) + 1;
  }

  const { data, error } = await admin
    .from("event_shirts")
    .insert({
      trip_id,
      day_label: day_label.trim(),
      name: name.trim(),
      description: description?.trim() || null,
      image_url: image_url || null,
      sort_order: order,
    })
    .select("id, day_label, name, description, image_url, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PUT - Update a shirt
export async function PUT(request: NextRequest) {
  if (!(await checkPermissionAccess(SHIRT_PERMISSION))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { id, day_label, name, description, image_url, sort_order } = body;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const updates: Record<string, unknown> = {};
  if (day_label !== undefined) updates.day_label = day_label.trim();
  if (name !== undefined) updates.name = name.trim();
  if (description !== undefined) updates.description = description?.trim() || null;
  if (sort_order !== undefined) updates.sort_order = sort_order;

  // When the photo changes (including being cleared), remove the old one.
  if (image_url !== undefined) {
    const { data: current } = await admin
      .from("event_shirts")
      .select("image_url")
      .eq("id", id)
      .single();
    if (current?.image_url && current.image_url !== image_url) {
      await cleanupImage(admin, current.image_url);
    }
    updates.image_url = image_url || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await admin
    .from("event_shirts")
    .update(updates)
    .eq("id", id)
    .select("id, day_label, name, description, image_url, sort_order")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// DELETE - Remove a shirt and its uploaded photo
export async function DELETE(request: NextRequest) {
  if (!(await checkPermissionAccess(SHIRT_PERMISSION))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await request.json();
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { data: shirt } = await admin
    .from("event_shirts")
    .select("image_url")
    .eq("id", id)
    .single();
  await cleanupImage(admin, shirt?.image_url ?? null);

  const { error } = await admin.from("event_shirts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
