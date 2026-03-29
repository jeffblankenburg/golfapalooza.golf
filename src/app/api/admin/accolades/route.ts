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
    const { trip_id, title, user_id, sort_order } = await request.json();

    if (!trip_id || !title || !user_id) {
      return NextResponse.json(
        { error: "Trip ID, title, and user are required" },
        { status: 400 }
      );
    }

    const adminClient = createAdminClient();
    const { data, error } = await adminClient
      .from("accolades")
      .insert({ trip_id, title, user_id, sort_order: sort_order || 0 })
      .select("*, user:users(id, display_name, avatar_url)")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ accolade: data });
  } catch (error) {
    console.error("Create accolade error:", error);
    return NextResponse.json({ error: "Failed to create accolade" }, { status: 500 });
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
