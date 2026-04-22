import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBirthdaysToday } from "@/lib/birthday/today";

/**
 * @swagger
 * /api/birthdays/today:
 *   get:
 *     summary: List Loozers whose birthday is today (in the active trip's timezone)
 *     tags: [Birthdays]
 *     responses:
 *       200:
 *         description: Birthdays today
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("timezone")
    .eq("status", "active")
    .single();
  const tz = trip?.timezone || "America/New_York";

  const birthdays = await getBirthdaysToday(adminClient, tz);
  return NextResponse.json({ birthdays });
}
