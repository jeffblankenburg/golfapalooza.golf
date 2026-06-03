import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import type { PollAudienceType, PollQuestionType } from "@/types/golf";

interface IncomingOption {
  option_text: string;
  order_index?: number;
}

interface IncomingQuestion {
  question_text: string;
  question_type: PollQuestionType;
  max_selections?: number | null;
  max_length?: number | null;
  order_index?: number;
  options?: IncomingOption[];
}

interface CreatePollBody {
  title: string;
  description?: string | null;
  audience_type: PollAudienceType;
  audience_user_ids?: string[] | null;
  trip_id?: string | null;
  is_anonymous?: boolean;
  send_notification_on_launch?: boolean;
  show_results_while_open?: boolean;
  questions: IncomingQuestion[];
}

function validatePayload(body: CreatePollBody): string | null {
  if (!body.title?.trim()) return "title is required";
  if (!["everyone", "event", "custom"].includes(body.audience_type)) {
    return "audience_type must be everyone, event, or custom";
  }
  if (body.audience_type === "event" && !body.trip_id) {
    return "trip_id is required for event audience";
  }
  if (
    body.audience_type === "custom" &&
    (!Array.isArray(body.audience_user_ids) || body.audience_user_ids.length === 0)
  ) {
    return "audience_user_ids is required for custom audience";
  }
  if (!Array.isArray(body.questions) || body.questions.length === 0) {
    return "at least one question is required";
  }
  for (const q of body.questions) {
    if (!q.question_text?.trim()) return "question_text is required";
    if (!["single", "multi", "text"].includes(q.question_type)) {
      return `question_type must be single, multi, or text`;
    }
    if (q.question_type === "single" || q.question_type === "multi") {
      if (!Array.isArray(q.options) || q.options.length < 2) {
        return "select questions need at least 2 options";
      }
      for (const o of q.options) {
        if (!o.option_text?.trim()) return "option_text is required";
      }
    }
    if (q.question_type === "multi" && q.max_selections != null && q.max_selections < 1) {
      return "max_selections must be >= 1";
    }
  }
  return null;
}

/**
 * @swagger
 * /api/admin/polls:
 *   get:
 *     summary: List all polls (admin)
 *     tags: [Admin, Polls]
 *     responses:
 *       200:
 *         description: List of polls
 *       401:
 *         description: Unauthorized
 */
export async function GET() {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const adminClient = createAdminClient();
  const { data: polls, error } = await adminClient
    .from("polls")
    .select(
      "id, title, description, audience_type, audience_user_ids, trip_id, is_anonymous, send_notification_on_launch, show_results_while_open, status, starts_at, ends_at, created_by, created_at, updated_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pollIds = (polls || []).map((p) => p.id);
  const countsByPoll = new Map<string, number>();
  if (pollIds.length > 0) {
    const { data: respCounts } = await adminClient
      .from("poll_responses")
      .select("poll_id")
      .in("poll_id", pollIds);
    for (const row of respCounts || []) {
      countsByPoll.set(row.poll_id, (countsByPoll.get(row.poll_id) || 0) + 1);
    }
  }

  const result = (polls || []).map((p) => ({
    ...p,
    response_count: countsByPoll.get(p.id) || 0,
  }));

  return NextResponse.json({ polls: result });
}

/**
 * @swagger
 * /api/admin/polls:
 *   post:
 *     summary: Create a new poll (always starts as draft)
 *     tags: [Admin, Polls]
 *     responses:
 *       200:
 *         description: Poll created
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 */
export async function POST(request: NextRequest) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: CreatePollBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validationError = validatePayload(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const { data: poll, error: pollErr } = await adminClient
    .from("polls")
    .insert({
      title: body.title.trim(),
      description: body.description?.trim() || null,
      audience_type: body.audience_type,
      audience_user_ids:
        body.audience_type === "custom" ? body.audience_user_ids : null,
      trip_id: body.audience_type === "event" ? body.trip_id : null,
      is_anonymous: body.is_anonymous ?? false,
      send_notification_on_launch: body.send_notification_on_launch ?? true,
      show_results_while_open: body.show_results_while_open ?? false,
      status: "draft",
      created_by: admin.id,
    })
    .select()
    .single();

  if (pollErr || !poll) {
    return NextResponse.json(
      { error: pollErr?.message || "Failed to create poll" },
      { status: 500 }
    );
  }

  const questionRows = body.questions.map((q, i) => ({
    poll_id: poll.id,
    question_text: q.question_text.trim(),
    question_type: q.question_type,
    max_selections:
      q.question_type === "multi" ? q.max_selections ?? null : null,
    max_length: q.question_type === "text" ? q.max_length ?? 500 : null,
    order_index: q.order_index ?? i,
  }));

  const { data: insertedQuestions, error: qErr } = await adminClient
    .from("poll_questions")
    .insert(questionRows)
    .select();

  if (qErr || !insertedQuestions) {
    await adminClient.from("polls").delete().eq("id", poll.id);
    return NextResponse.json(
      { error: qErr?.message || "Failed to create questions" },
      { status: 500 }
    );
  }

  // Build option rows in question order
  const optionRows: {
    question_id: string;
    option_text: string;
    order_index: number;
  }[] = [];
  for (let i = 0; i < body.questions.length; i++) {
    const q = body.questions[i];
    const inserted = insertedQuestions[i];
    if (q.question_type === "single" || q.question_type === "multi") {
      const opts = q.options || [];
      for (let j = 0; j < opts.length; j++) {
        optionRows.push({
          question_id: inserted.id,
          option_text: opts[j].option_text.trim(),
          order_index: opts[j].order_index ?? j,
        });
      }
    }
  }

  if (optionRows.length > 0) {
    const { error: oErr } = await adminClient.from("poll_options").insert(optionRows);
    if (oErr) {
      await adminClient.from("polls").delete().eq("id", poll.id);
      return NextResponse.json({ error: oErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({ poll: { ...poll, response_count: 0 } });
}
