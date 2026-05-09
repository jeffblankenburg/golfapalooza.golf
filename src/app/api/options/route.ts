import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { computeOptionCosts } from "@/lib/cost-items/compute";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");
  if (!tripId) return NextResponse.json({ error: "trip_id is required" }, { status: 400 });

  const adminClient = createAdminClient();

  // Fetch groups, options, and settings in parallel
  const [groupsResult, optionsResult, settingsResult] = await Promise.all([
    adminClient
      .from("option_groups")
      .select("*")
      .eq("trip_id", tripId)
      .order("sort_order"),
    adminClient
      .from("trip_options")
      .select("*")
      .eq("trip_id", tripId)
      .order("sort_order"),
    adminClient
      .from("trip_option_settings")
      .select("*")
      .eq("trip_id", tripId)
      .maybeSingle(),
  ]);

  if (groupsResult.error) return NextResponse.json({ error: groupsResult.error.message }, { status: 500 });
  if (optionsResult.error) return NextResponse.json({ error: optionsResult.error.message }, { status: 500 });
  if (settingsResult.error) return NextResponse.json({ error: settingsResult.error.message }, { status: 500 });

  const settings = settingsResult.data || { selection_deadline: null, is_open: true };

  // Replace stored option costs with values computed from linked cost_items.
  const options = await computeOptionCosts(adminClient, optionsResult.data || []);

  return NextResponse.json({
    groups: groupsResult.data || [],
    options,
    settings: {
      selection_deadline: settings.selection_deadline,
      is_open: settings.is_open ?? true,
    },
  });
}
