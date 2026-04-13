import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";

// GET - Return tee time counts per day for a trip (single query)
export async function GET(request: Request) {
  const admin = await checkIsAdmin();
  if (!admin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id required" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const { data: teeTimes } = await adminClient
    .from("tee_times")
    .select("day_number")
    .eq("trip_id", tripId);

  const counts: Record<number, number> = {};
  for (const tt of teeTimes || []) {
    counts[tt.day_number] = (counts[tt.day_number] || 0) + 1;
  }

  return NextResponse.json({ counts });
}
