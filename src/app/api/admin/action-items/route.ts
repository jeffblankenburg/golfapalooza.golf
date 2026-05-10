import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import { getEffectiveTripId } from "@/lib/simulator";

/**
 * @swagger
 * /api/admin/action-items:
 *   get:
 *     summary: Get action items for the active event
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Action items list
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripIdParam = searchParams.get("trip_id");

  const adminClient = createAdminClient();

  // Resolve trip: use provided trip_id or fall back to active trip
  let trip: { id: string } | null = null;

  if (tripIdParam) {
    trip = { id: tripIdParam };
  } else {
    const { data } = await adminClient
      .from("trip_settings")
      .select("id")
      .eq("id", (await getEffectiveTripId())!)
      .single();
    trip = data;
  }

  if (!trip) {
    return NextResponse.json({ items: [], tripId: null });
  }

  const { data: items, error } = await adminClient
    .from("action_items")
    .select("*")
    .eq("trip_id", trip.id)
    .order("sort_order");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ items, tripId: trip.id });
}

/**
 * @swagger
 * /api/admin/action-items:
 *   post:
 *     summary: Create an action item
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Action item created
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { trip_id, title, description, deadline, link, sort_order } =
      await request.json();

    if (!trip_id || !title) {
      return NextResponse.json(
        { error: "trip_id and title are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { data, error } = await adminClient
      .from("action_items")
      .insert({
        trip_id,
        title,
        description: description || null,
        deadline: deadline || null,
        link: link || null,
        sort_order: sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    console.error("Create action item error:", error);
    return NextResponse.json(
      { error: "Failed to create action item" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/action-items:
 *   put:
 *     summary: Update an action item
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Action item updated
 *       401:
 *         description: Unauthorized
 */
export async function PUT(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, title, description, deadline, link, sort_order } =
      await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Action item id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("action_items")
      .update({
        title,
        description: description || null,
        deadline: deadline || null,
        link: link || null,
        sort_order: sort_order ?? 0,
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Update action item error:", error);
    return NextResponse.json(
      { error: "Failed to update action item" },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/admin/action-items:
 *   delete:
 *     summary: Delete an action item
 *     tags: [Admin]
 *     responses:
 *       200:
 *         description: Action item deleted
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
        { error: "Action item id is required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    const { error } = await adminClient
      .from("action_items")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete action item error:", error);
    return NextResponse.json(
      { error: "Failed to delete action item" },
      { status: 500 }
    );
  }
}
