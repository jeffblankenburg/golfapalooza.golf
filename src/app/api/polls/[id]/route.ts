import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { loadPollWithQuestions, loadUserResponse, loadPollResults } from "@/lib/polls";
import { isUserInAudience } from "@/lib/audience";

/**
 * @swagger
 * /api/polls/{id}:
 *   get:
 *     summary: Get a poll for the current user (with response and post-close results)
 *     tags: [Polls]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const effectiveUserId = await getEffectiveUserId(user.id);
  const adminClient = createAdminClient();

  const poll = await loadPollWithQuestions(adminClient, id);
  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Drafts and unscheduled polls are admin-only.
  if (poll.status === "draft") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const eligible = await isUserInAudience(adminClient, effectiveUserId, {
    audience_type: poll.audience_type,
    audience_user_ids: poll.audience_user_ids,
    trip_id: poll.trip_id,
  });
  if (!eligible) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const response = await loadUserResponse(adminClient, id, effectiveUserId);

  let results = null;
  if (poll.status === "closed") {
    // Players never see attribution, even on non-anonymous polls.
    results = await loadPollResults(adminClient, poll, "anonymous");
  } else if (
    poll.status === "active" &&
    poll.show_results_while_open &&
    (response || poll.show_results_before_vote)
  ) {
    // Live results while the poll is open. By default only voters who've
    // submitted see them; when show_results_before_vote is on, everyone in
    // the audience sees them even before voting.
    // Strip text-answer content — only the count of responses is exposed.
    results = await loadPollResults(adminClient, poll, "anonymous");
    for (const q of results.questions) {
      if (q.text_answers) {
        q.text_answers = q.text_answers.map(() => ({ text: "" }));
      }
    }
  }

  return NextResponse.json({ poll, response, results });
}
