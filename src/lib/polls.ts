import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Poll,
  PollQuestion,
  PollOption,
  PollResults,
  PollQuestionResults,
  PollOptionResult,
  PollTextAnswer,
} from "@/types/golf";

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
      "id, title, description, audience_type, audience_user_ids, trip_id, is_anonymous, send_notification_on_launch, status, starts_at, ends_at, created_by, created_at, updated_at"
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

  // For attributed text answers, we need user_id per response
  const userByResponse = new Map<string, { id: string; display_name: string }>();
  if (attribution === "attributed") {
    const responseIds = (respondents || []).map((r) => r.id);
    if (responseIds.length > 0) {
      const { data: rows } = await client
        .from("poll_responses")
        .select("id, user_id, users!inner(id, display_name)")
        .in("id", responseIds);
      for (const r of rows || []) {
        const u = (r as unknown as { users: { id: string; display_name: string } }).users;
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
    for (const a of answers) {
      if (a.option_id) {
        counts.set(a.option_id, (counts.get(a.option_id) || 0) + 1);
      }
    }
    const options: PollOptionResult[] = q.options.map((o) => ({
      option_id: o.id,
      option_text: o.option_text,
      count: counts.get(o.id) || 0,
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
