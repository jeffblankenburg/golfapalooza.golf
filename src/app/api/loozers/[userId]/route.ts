import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isSimulating } from "@/lib/simulator";
import { loadLoozerProfile } from "@/lib/loozers/profile-data";

/**
 * @swagger
 * /api/loozers/{userId}:
 *   get:
 *     summary: Get a Loozer's profile with accolades and tagged photos
 *     tags: [Loozers]
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Loozer profile
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: User not found
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const { userId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const simulating = await isSimulating();
  const queryClient = simulating ? createAdminClient() : supabase;
  const adminClient = createAdminClient();

  const data = await loadLoozerProfile(queryClient, adminClient, userId);
  if (!data) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
