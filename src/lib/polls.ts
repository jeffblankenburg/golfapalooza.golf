import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Poll,
  PollQuestion,
  PollOption,
  PollResponse,
  PollResults,
  PollQuestionResults,
  PollOptionResult,
  PollTextAnswer,
} from "@/types/golf";
import { isUserInAudience } from "@/lib/audience";

/**
 * Loads a poll with its questions and options ordered by order_index.
 * Returns null if not found.
 */
export async function loadPollWithQuestions(
  client: SupabaseClient,
  pollId: string
): Promise<Poll | null> {
  const { data: poll } = await client
    .from("polls")
    .select(
      "id, title, description, audience_type, audience_user_ids, trip_id, is_anonymous, send_notification_on_launch, show_results_while_open, show_results_before_vote, status, starts_at, ends_at, created_by, on_behalf_of_user_id, created_at, updated_at"
    )
    .eq("id", pollId)
    .maybeSingle();

  if (!poll) return null;

  const { data: questions } = await client
    .from("poll_questions")
    .select(
      "id, poll_id, question_text, question_type, max_selections, max_length, order_index"
    )
    .eq("poll_id", pollId)
    .order("order_index");

  const questionIds = (questions || []).map((q) => q.id);
  const optionsByQuestion = new Map<string, PollOption[]>();
  if (questionIds.length > 0) {
    const { data: options } = await client
      .from("poll_options")
      .select("id, question_id, option_text, order_index")
      .in("question_id", questionIds)
      .order("order_index");

    for (const opt of options || []) {
      const arr = optionsByQuestion.get(opt.question_id) || [];
      arr.push(opt as PollOption);
      optionsByQuestion.set(opt.question_id, arr);
    }
  }

  const fullQuestions: PollQuestion[] = (questions || []).map((q) => ({
    ...(q as Omit<PollQuestion, "options">),
    options: optionsByQuestion.get(q.id) || [],
  }));

  return { ...(poll as Omit<Poll, "questions">), questions: fullQuestions };
}

/**
 * Loads the user's response to a poll (if any), with their answers.
 */
export async function loadUserResponse(
  client: SupabaseClient,
  pollId: string,
  userId: string
) {
  const { data: response } = await client
    .from("poll_responses")
    .select("id, poll_id, user_id, submitted_at, updated_at")
    .eq("poll_id", pollId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!response) return null;

  const { data: answers } = await client
    .from("poll_answers")
    .select("question_id, option_id, text_answer")
    .eq("response_id", response.id);

  return { ...response, answers: answers || [] };
}

/**
 * Aggregates results for a poll.
 *
 * `attribution`:
 *   - "anonymous": never includes user_id/display_name on text answers
 *   - "attributed": includes them (admin views on non-anonymous polls)
 */
export async function loadPollResults(
  client: SupabaseClient,
  poll: Poll,
  attribution: "anonymous" | "attributed"
): Promise<PollResults> {
  const { data: respondents } = await client
    .from("poll_responses")
    .select("id")
    .eq("poll_id", poll.id);
  const totalRespondents = respondents?.length || 0;

  const questionIds = poll.questions.map((q) => q.id);
  const answersByQuestion = new Map<
    string,
    { option_id: string | null; text_answer: string | null; response_id: string }[]
  >();

  if (questionIds.length > 0) {
    const { data: answers } = await client
      .from("poll_answers")
      .select("question_id, option_id, text_answer, response_id")
      .in("question_id", questionIds);
    for (const a of answers || []) {
      const arr = answersByQuestion.get(a.question_id) || [];
      arr.push(a);
      answersByQuestion.set(a.question_id, arr);
    }
  }

  // For attributed views we map response_id → user so we can attach voter
  // lists to options (and names to text answers).
  const userByResponse = new Map<
    string,
    { id: string; display_name: string; avatar_url: string | null }
  >();
  if (attribution === "attributed") {
    const responseIds = (respondents || []).map((r) => r.id);
    if (responseIds.length > 0) {
      const { data: rows } = await client
        .from("poll_responses")
        .select("id, user_id, users!inner(id, display_name, avatar_url)")
        .in("id", responseIds);
      for (const r of rows || []) {
        const u = (r as unknown as {
          users: { id: string; display_name: string; avatar_url: string | null };
        }).users;
        userByResponse.set(r.id, u);
      }
    }
  }

  const questions: PollQuestionResults[] = poll.questions.map((q) => {
    const answers = answersByQuestion.get(q.id) || [];
    if (q.question_type === "text") {
      const text_answers: PollTextAnswer[] = [];
      for (const a of answers) {
        if (a.text_answer == null) continue;
        const entry: PollTextAnswer = { text: a.text_answer };
        if (attribution === "attributed") {
          const u = userByResponse.get(a.response_id);
          if (u) {
            entry.user_id = u.id;
            entry.display_name = u.display_name;
          }
        }
        text_answers.push(entry);
      }
      return {
        question_id: q.id,
        question_text: q.question_text,
        question_type: q.question_type,
        text_answers,
      };
    }

    const counts = new Map<string, number>();
    const votersByOption = new Map<
      string,
      { user_id: string; display_name: string; avatar_url: string | null }[]
    >();
    for (const a of answers) {
      if (!a.option_id) continue;
      counts.set(a.option_id, (counts.get(a.option_id) || 0) + 1);
      if (attribution === "attributed") {
        const u = userByResponse.get(a.response_id);
        if (u) {
          const arr = votersByOption.get(a.option_id) || [];
          arr.push({ user_id: u.id, display_name: u.display_name, avatar_url: u.avatar_url });
          votersByOption.set(a.option_id, arr);
        }
      }
    }
    const options: PollOptionResult[] = q.options.map((o) => ({
      option_id: o.id,
      option_text: o.option_text,
      count: counts.get(o.id) || 0,
      ...(attribution === "attributed"
        ? { voters: votersByOption.get(o.id) || [] }
        : {}),
    }));
    return {
      question_id: q.id,
      question_text: q.question_text,
      question_type: q.question_type,
      options,
    };
  });

  return { poll_id: poll.id, total_respondents: totalRespondents, questions };
}

/**
 * Server-side equivalent of GET /api/polls/active — resolves the list of
 * currently-active polls the user is eligible to see, each with the user's
 * existing response (if any). Used to SSR-prefetch the home-page poll banners.
 * Ordered by `starts_at` ascending so the oldest active poll renders first.
 */
export async function loadActivePollsForUser(
  client: SupabaseClient,
  userId: string
): Promise<{ poll: Poll; response: PollResponse | null }[]> {
  const { data: activeRows } = await client
    .from("polls")
    .select("id, audience_type, audience_user_ids, trip_id, starts_at")
    .eq("status", "active")
    .order("starts_at", { ascending: true });
  if (!activeRows || activeRows.length === 0) return [];

  const results: { poll: Poll; response: PollResponse | null }[] = [];
  for (const row of activeRows) {
    const eligible = await isUserInAudience(client, userId, {
      audience_type: row.audience_type,
      audience_user_ids: row.audience_user_ids,
      trip_id: row.trip_id,
    });
    if (!eligible) continue;
    const poll = await loadPollWithQuestions(client, row.id);
    if (!poll) continue;
    const response = (await loadUserResponse(client, row.id, userId)) as PollResponse | null;
    results.push({ poll, response });
  }
  return results;
}

/**
 * Returns true if the given user is in the audience of at least one closed
 * poll. Used by the home page to hide the "Polls" quick link when there's
 * no history to show.
 */
export async function userHasClosedPolls(
  client: SupabaseClient,
  userId: string
): Promise<boolean> {
  const { data: tripRows } = await client
    .from("event_participants")
    .select("trip_id")
    .eq("user_id", userId);
  const tripIds = (tripRows || []).map((r: { trip_id: string }) => r.trip_id);

  const orParts = [
    "audience_type.eq.everyone",
    `audience_user_ids.cs.{${userId}}`,
  ];
  if (tripIds.length > 0) {
    orParts.push(
      `and(audience_type.eq.event,trip_id.in.(${tripIds.join(",")}))`
    );
  }

  const { data } = await client
    .from("polls")
    .select("id")
    .eq("status", "closed")
    .or(orParts.join(","))
    .limit(1);

  return (data?.length || 0) > 0;
}

/**
 * Returns any polls whose [starts_at, ends_at] overlaps the given window.
 * Excludes drafts (no window) and closed polls. Optionally excludes a poll by id.
 */
export async function findOverlappingPolls(
  client: SupabaseClient,
  startsAt: string,
  endsAt: string,
  excludePollId?: string
) {
  let query = client
    .from("polls")
    .select("id, title, status, starts_at, ends_at")
    .in("status", ["scheduled", "active"])
    .lt("starts_at", endsAt)
    .gt("ends_at", startsAt);

  if (excludePollId) {
    query = query.neq("id", excludePollId);
  }

  const { data } = await query;
  return data || [];
}
