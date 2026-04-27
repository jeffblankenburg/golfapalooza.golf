import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { isUserInAudience } from "@/lib/audience";

/**
 * @swagger
 * /api/polls/history:
 *   get:
 *     summary: List closed polls visible to the current user
 *     tags: [Polls]
 */
export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const effectiveUserId = await getEffectiveUserId(user.id);
  const adminClient = createAdminClient();

  const { data: closed } = await adminClient
    .from("polls")
    .select(
      "id, title, description, audience_type, audience_user_ids, trip_id, is_anonymous, status, starts_at, ends_at, created_at"
    )
    .eq("status", "closed")
    .order("ends_at", { ascending: false })
    .limit(100);

  const visible: typeof closed = [];
  for (const p of closed || []) {
    const eligible = await isUserInAudience(adminClient, effectiveUserId, {
      audience_type: p.audience_type,
      audience_user_ids: p.audience_user_ids,
      trip_id: p.trip_id,
    });
    if (eligible) visible.push(p);
  }

  return NextResponse.json({ polls: visible });
}
