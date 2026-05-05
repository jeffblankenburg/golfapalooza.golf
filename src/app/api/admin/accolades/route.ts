import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: accolades, error } = await adminClient
    .from("accolades")
    .select("*, user:users(id, display_name, avatar_url)")
    .eq("trip_id", tripId)
    .order("sort_order", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ accolades });
}

export async function POST(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      trip_id,
      title,
      user_id,
      sort_order,
      category,
      partner_user_id,
      notes,
    } = (await request.json()) as {
      trip_id?: string;
      title?: string | null;
      user_id?: string;
      sort_order?: number;
      category?: string;
      partner_user_id?: string | null;
      notes?: string | null;
    };

    if (!trip_id || !user_id) {
      return NextResponse.json(
        { error: "trip_id and user_id are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();

    // Title resolution: caller value wins; otherwise inherit from the
    // category's metadata. Required for legacy callers that pass `category`
    // implicitly as 'custom' — they must provide a title.
    let resolvedTitle = title?.trim() || null;
    const resolvedCategory = category?.trim() || "custom";
    if (!resolvedTitle) {
      const { data: cat } = await adminClient
        .from("accolade_categories")
        .select("title")
        .eq("category", resolvedCategory)
        .maybeSingle();
      if (!cat) {
        return NextResponse.json(
          { error: `Unknown category "${resolvedCategory}"` },
          { status: 400 }
        );
      }
      resolvedTitle = cat.title;
    }
    if (resolvedCategory === "custom" && !title?.trim()) {
      return NextResponse.json(
        { error: "Custom accolades require a title" },
        { status: 400 }
      );
    }

    const trimmedNotes = typeof notes === "string" ? notes.trim() : null;
    const { data, error } = await adminClient
      .from("accolades")
      .insert({
        trip_id,
        title: resolvedTitle,
        user_id,
        sort_order: sort_order || 0,
        category: resolvedCategory,
        partner_user_id: partner_user_id || null,
        notes: trimmedNotes ? trimmedNotes : null,
      })
      .select(
        "*, user:users!accolades_user_id_fkey(id, display_name, full_name, avatar_url), partner:users!accolades_partner_user_id_fkey(id, display_name, full_name, avatar_url), trip:trip_settings(trip_year, trip_name)"
      )
      .single();

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This person already has this award for this trip" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ accolade: data });
  } catch (error) {
    console.error("Create accolade error:", error);
    return NextResponse.json({ error: "Failed to create accolade" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { id, notes } = (await request.json()) as {
      id?: string;
      notes?: string | null;
    };
    if (!id) {
      return NextResponse.json({ error: "Accolade ID is required" }, { status: 400 });
    }

    const trimmed = typeof notes === "string" ? notes.trim() : null;
    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("accolades")
      .update({ notes: trimmed ? trimmed : null })
      .eq("id", id)
      .select("id, notes")
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Accolade not found" }, { status: 404 });
    }
    return NextResponse.json({ accolade: data });
  } catch (error) {
    console.error("Update accolade error:", error);
    return NextResponse.json({ error: "Failed to update accolade" }, { status: 500 });
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
      return NextResponse.json({ error: "Accolade ID is required" }, { status: 400 });
    }

    const adminClient = createAdminClient();
    const { error } = await adminClient
      .from("accolades")
      .delete()
      .eq("id", id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete accolade error:", error);
    return NextResponse.json({ error: "Failed to delete accolade" }, { status: 500 });
  }
}
