import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const pinnedTo = searchParams.get("pinned_to");
  let tripId = searchParams.get("trip_id");

  // Fall back to active trip
  if (!tripId) {
    const { data: trip } = await supabase
      .from("trip_settings")
      .select("id")
      .eq("status", "active")
      .single();
    tripId = trip?.id || null;
  }

  if (!tripId) return NextResponse.json({ error: "No active trip" }, { status: 404 });

  // If pinned_to is provided, return a single pinned note
  if (pinnedTo) {
    const { data: note } = await supabase
      .from("notebook_notes")
      .select("id, title, content, pinned_to")
      .eq("trip_id", tripId)
      .eq("pinned_to", pinnedTo)
      .maybeSingle();

    return NextResponse.json({ note });
  }

  // Otherwise return all non-system categories with notes (biographies are shown on profiles, not here)
  const [categoriesResult, notesResult] = await Promise.all([
    supabase
      .from("notebook_categories")
      .select("id, name, sort_order")
      .eq("trip_id", tripId)
      .eq("is_system", false)
      .order("sort_order"),
    supabase
      .from("notebook_notes")
      .select("id, title, content, category_id, sort_order, pinned_to")
      .eq("trip_id", tripId)
      .order("sort_order"),
  ]);

  const categories = (categoriesResult.data || []).map((cat) => ({
    ...cat,
    notes: (notesResult.data || []).filter((n) => n.category_id === cat.id),
  }));

  return NextResponse.json({ categories });
}
