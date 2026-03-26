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

/**
 * @swagger
 * /api/admin/rooms/facilities:
 *   get:
 *     summary: List all facilities with optional trip linking info
 *     tags: [Admin]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         schema:
 *           type: string
 *         description: If provided, includes which facilities are linked to this trip
 *     responses:
 *       200:
 *         description: Facilities list
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

  const adminClient = createAdminClient();

  const { data: facilities, error } = await adminClient
    .from("facilities")
    .select("id, name, sort_order")
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let linkedFacilityIds: string[] = [];
  if (tripId) {
    const { data: links } = await adminClient
      .from("trip_facilities")
      .select("facility_id")
      .eq("trip_id", tripId);

    linkedFacilityIds = (links || []).map((l) => l.facility_id);
  }

  return NextResponse.json({ facilities: facilities || [], linkedFacilityIds });
}

/**
 * @swagger
 * /api/admin/rooms/facilities:
 *   post:
 *     summary: Create a new standalone facility, optionally link to a trip
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Facility created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { name, sort_order, trip_id } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("facilities")
      .insert({ name: name.trim(), sort_order: sort_order ?? 0 })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A facility with that name already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Optionally link to a trip
    if (trip_id && data) {
      await adminClient
        .from("trip_facilities")
        .insert({ trip_id, facility_id: data.id });
    }

    return NextResponse.json({ facility: data });
  } catch (error) {
    console.error("Create facility error:", error);
    return NextResponse.json(
      { error: "Failed to create facility" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/rooms/facilities:
 *   put:
 *     summary: Link or unlink a facility to/from a trip
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Facility link updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { facility_id, trip_id, linked } = await request.json();

    if (!facility_id || !trip_id) {
      return NextResponse.json(
        { error: "facility_id and trip_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    if (linked) {
      const { error } = await adminClient
        .from("trip_facilities")
        .insert({ trip_id, facility_id })
        .select()
        .single();

      if (error && error.code !== "23505") {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    } else {
      const { error } = await adminClient
        .from("trip_facilities")
        .delete()
        .eq("trip_id", trip_id)
        .eq("facility_id", facility_id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update facility link error:", error);
    return NextResponse.json(
      { error: "Failed to update facility link" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/rooms/facilities:
 *   patch:
 *     summary: Update facility properties (name, sort_order)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Facility updated
 *       401:
 *         description: Unauthorized
 */
export async function PATCH(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, name, sort_order } = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Facility id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (sort_order !== undefined) updates.sort_order = sort_order;

    const { error } = await adminClient
      .from("facilities")
      .update(updates)
      .eq("id", id);

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A facility with that name already exists" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update facility error:", error);
    return NextResponse.json(
      { error: "Failed to update facility" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/rooms/facilities:
 *   delete:
 *     summary: Delete a facility (cascades rooms and assignments)
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Facility deleted
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
        { error: "Facility id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("facilities")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete facility error:", error);
    return NextResponse.json(
      { error: "Failed to delete facility" },
      { status: 500 }
    );
  }
}
