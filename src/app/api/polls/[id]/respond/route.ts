import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEffectiveUserId } from "@/lib/simulator";
import { loadPollWithQuestions } from "@/lib/polls";
import { isUserInAudience } from "@/lib/audience";

interface IncomingAnswer {
  question_id: string;
  option_id?: string | null;
  text_answer?: string | null;
}

/**
 * @swagger
 * /api/polls/{id}/respond:
 *   post:
 *     summary: Submit or update the user's response (full replace)
 *     tags: [Polls]
 */
export async function POST(
  request: NextRequest,
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
  const { answers } = (await request.json()) as { answers: IncomingAnswer[] };

  if (!Array.isArray(answers)) {
    return NextResponse.json({ error: "answers array is required" }, { status: 400 });
  }

  const adminClient = createAdminClient();

  const poll = await loadPollWithQuestions(adminClient, id);
  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (poll.status !== "active") {
    return NextResponse.json({ error: "Poll is not active" }, { status: 400 });
  }

  const eligible = await isUserInAudience(adminClient, effectiveUserId, {
    audience_type: poll.audience_type,
    audience_user_ids: poll.audience_user_ids,
    trip_id: poll.trip_id,
  });
  if (!eligible) return NextResponse.json({ error: "Not in audience" }, { status: 403 });

  // Validate answers per-question
  const answersByQuestion = new Map<string, IncomingAnswer[]>();
  for (const a of answers) {
    if (!a.question_id) {
      return NextResponse.json({ error: "question_id required" }, { status: 400 });
    }
    const arr = answersByQuestion.get(a.question_id) || [];
    arr.push(a);
    answersByQuestion.set(a.question_id, arr);
  }

  // Build the rows to insert, validating each question's constraints.
  const rowsToInsert: { question_id: string; option_id: string | null; text_answer: string | null }[] = [];

  for (const q of poll.questions) {
    const qa = answersByQuestion.get(q.id) || [];

    if (qa.length === 0) {
      // Optional questions are allowed to be skipped. We don't enforce required for v1.
      continue;
    }

    if (q.question_type === "single") {
      if (qa.length !== 1 || !qa[0].option_id) {
        return NextResponse.json(
          { error: `Single-select question requires exactly one option_id` },
          { status: 400 }
        );
      }
      const validOption = q.options.some((o) => o.id === qa[0].option_id);
      if (!validOption) {
        return NextResponse.json(
          { error: "Invalid option_id for question" },
          { status: 400 }
        );
      }
      rowsToInsert.push({
        question_id: q.id,
        option_id: qa[0].option_id,
        text_answer: null,
      });
    } else if (q.question_type === "multi") {
      const optionIds = qa.map((a) => a.option_id).filter(Boolean) as string[];
      if (optionIds.length === 0) {
        return NextResponse.json(
          { error: "Multi-select question requires at least one option" },
          { status: 400 }
        );
      }
      if (q.max_selections != null && optionIds.length > q.max_selections) {
        return NextResponse.json(
          { error: `Max ${q.max_selections} selections for this question` },
          { status: 400 }
        );
      }
      const dedup = new Set(optionIds);
      if (dedup.size !== optionIds.length) {
        return NextResponse.json(
          { error: "Duplicate option_id in multi-select" },
          { status: 400 }
        );
      }
      for (const oid of optionIds) {
        const validOption = q.options.some((o) => o.id === oid);
        if (!validOption) {
          return NextResponse.json(
            { error: "Invalid option_id for question" },
            { status: 400 }
          );
        }
        rowsToInsert.push({ question_id: q.id, option_id: oid, text_answer: null });
      }
    } else if (q.question_type === "text") {
      const text = qa[0].text_answer?.trim();
      if (!text) {
        return NextResponse.json(
          { error: "Text answer cannot be empty" },
          { status: 400 }
        );
      }
      const max = q.max_length ?? 500;
      if (text.length > max) {
        return NextResponse.json(
          { error: `Text answer exceeds ${max} chars` },
          { status: 400 }
        );
      }
      rowsToInsert.push({
        question_id: q.id,
        option_id: null,
        text_answer: text,
      });
    }
  }

  // Upsert response row, then full-replace answers.
  const { data: existingResponse } = await adminClient
    .from("poll_responses")
    .select("id")
    .eq("poll_id", id)
    .eq("user_id", effectiveUserId)
    .maybeSingle();

  let responseId: string;
  if (existingResponse) {
    responseId = existingResponse.id;
    await adminClient
      .from("poll_responses")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", responseId);
    await adminClient.from("poll_answers").delete().eq("response_id", responseId);
  } else {
    const { data: inserted, error } = await adminClient
      .from("poll_responses")
      .insert({ poll_id: id, user_id: effectiveUserId })
      .select()
      .single();
    if (error || !inserted) {
      return NextResponse.json(
        { error: error?.message || "Failed to create response" },
        { status: 500 }
      );
    }
    responseId = inserted.id;
  }

  if (rowsToInsert.length > 0) {
    const { error } = await adminClient
      .from("poll_answers")
      .insert(rowsToInsert.map((r) => ({ ...r, response_id: responseId })));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, response_id: responseId });
}

/**
 * @swagger
 * /api/polls/{id}/respond:
 *   delete:
 *     summary: Withdraw the current user's response
 *     tags: [Polls]
 */
export async function DELETE(
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

  const { data: poll } = await adminClient
    .from("polls")
    .select("status")
    .eq("id", id)
    .maybeSingle();
  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (poll.status !== "active") {
    return NextResponse.json({ error: "Poll is not active" }, { status: 400 });
  }

  await adminClient
    .from("poll_responses")
    .delete()
    .eq("poll_id", id)
    .eq("user_id", effectiveUserId);

  return NextResponse.json({ success: true });
}
