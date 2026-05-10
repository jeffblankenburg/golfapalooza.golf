import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId, getEffectiveTripId } from "@/lib/simulator";
import { loadPollWithQuestions, loadUserResponse } from "@/lib/polls";
import { isUserInAudience } from "@/lib/audience";

/**
 * @swagger
 * /api/polls/active:
 *   get:
 *     summary: Get the currently active poll for the current user (or null)
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

  const { data: activePoll } = await adminClient
    .from("polls")
    .select(
      "id, audience_type, audience_user_ids, trip_id"
    )
    .eq("id", (await getEffectiveTripId())!)
    .maybeSingle();

  if (!activePoll) return NextResponse.json({ poll: null, response: null });

  const eligible = await isUserInAudience(adminClient, effectiveUserId, {
    audience_type: activePoll.audience_type,
    audience_user_ids: activePoll.audience_user_ids,
    trip_id: activePoll.trip_id,
  });
  if (!eligible) return NextResponse.json({ poll: null, response: null });

  const poll = await loadPollWithQuestions(adminClient, activePoll.id);
  const response = await loadUserResponse(adminClient, activePoll.id, effectiveUserId);

  return NextResponse.json({ poll, response });
}
