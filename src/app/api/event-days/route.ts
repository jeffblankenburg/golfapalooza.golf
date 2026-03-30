import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * @swagger
 * /api/event-days:
 *   get:
 *     summary: Get event days for a trip (authenticated)
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: trip_id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Event days list
 *       401:
 *         description: Unauthorized
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const tripId = searchParams.get("trip_id");

  if (!tripId) {
    return NextResponse.json({ error: "trip_id is required" }, { status: 400 });
  }

  const [daysResult, tripResult] = await Promise.all([
    supabase
      .from("event_days")
      .select("id, day_number, name")
      .eq("trip_id", tripId)
      .order("day_number"),
    supabase
      .from("trip_settings")
      .select("start_date")
      .eq("id", tripId)
      .single(),
  ]);

  if (daysResult.error) {
    return NextResponse.json({ error: daysResult.error.message }, { status: 500 });
  }

  const startDate = tripResult.data?.start_date;

  const days = (daysResult.data || []).map((d) => {
    let date: string | null = null;
    if (startDate) {
      const dt = new Date(startDate + "T00:00:00");
      dt.setDate(dt.getDate() + d.day_number - 1);
      date = dt.toISOString().split("T")[0];
    }
    return { ...d, date };
  });

  return NextResponse.json({ days });
}
