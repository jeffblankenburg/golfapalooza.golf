import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadLoozerList } from "@/lib/loozers/list-data";

/**
 * @swagger
 * /api/loozers:
 *   get:
 *     summary: List Loozers (with attendance flags + lifetime event count)
 *     tags: [Loozers]
 *     responses:
 *       200:
 *         description: List of Loozers
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
  const loozers = await loadLoozerList(adminClient);
  return NextResponse.json({ loozers });
}
