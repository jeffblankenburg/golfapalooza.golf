import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkIsAdmin } from "@/lib/permissions-server";
import {
  loadPollWithQuestions,
  loadPollResults,
  findOverlappingPolls,
} from "@/lib/polls";
import type { PollAudienceType, PollQuestionType } from "@/types/golf";

interface IncomingOption {
  id?: string;
  option_text: string;
  order_index?: number;
}

interface IncomingQuestion {
  id?: string;
  question_text: string;
  question_type: PollQuestionType;
  max_selections?: number | null;
  max_length?: number | null;
  order_index?: number;
  options?: IncomingOption[];
}

interface UpdatePollBody {
  title?: string;
  description?: string | null;
  audience_type?: PollAudienceType;
  audience_user_ids?: string[] | null;
  trip_id?: string | null;
  is_anonymous?: boolean;
  send_notification_on_launch?: boolean;
  show_results_while_open?: boolean;
  starts_at?: string | null;
  ends_at?: string | null;
  questions?: IncomingQuestion[];
}

/**
 * @swagger
 * /api/admin/polls/{id}:
 *   get:
 *     summary: Get a poll with questions, options, and results (admin)
 *     tags: [Admin, Polls]
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();

  const poll = await loadPollWithQuestions(adminClient, id);
  if (!poll) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Admin always sees results. Anonymity hides attribution even from admins
  // (per spec: anonymous polls show counts only, never user IDs).
  const attribution = poll.is_anonymous ? "anonymous" : "attributed";
  const results = await loadPollResults(adminClient, poll, attribution);

  return NextResponse.json({ poll, results });
}

/**
 * @swagger
 * /api/admin/polls/{id}:
 *   put:
 *     summary: Update a poll (admin). Status transitions go through /publish, /close, /reopen.
 *     tags: [Admin, Polls]
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  let body: UpdatePollBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const adminClient = createAdminClient();
  const existing = await loadPollWithQuestions(adminClient, id);
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Build poll-level update
  const update: Record<string, unknown> = {};
  if (body.title != null) {
    if (!body.title.trim()) {
      return NextResponse.json({ error: "title cannot be empty" }, { status: 400 });
    }
    update.title = body.title.trim();
  }
  if (body.description !== undefined) {
    update.description = body.description?.trim() || null;
  }
  if (body.audience_type) {
    if (!["everyone", "event", "custom"].includes(body.audience_type)) {
      return NextResponse.json({ error: "invalid audience_type" }, { status: 400 });
    }
    update.audience_type = body.audience_type;
    update.audience_user_ids =
      body.audience_type === "custom" ? body.audience_user_ids ?? [] : null;
    update.trip_id = body.audience_type === "event" ? body.trip_id ?? null : null;
  }
  if (body.is_anonymous !== undefined) update.is_anonymous = body.is_anonymous;
  if (body.send_notification_on_launch !== undefined) {
    update.send_notification_on_launch = body.send_notification_on_launch;
  }
  if (body.show_results_while_open !== undefined) {
    update.show_results_while_open = body.show_results_while_open;
  }

  // Window edits: validate overlap. Allowed for draft/scheduled/active.
  // Closed polls must use /reopen.
  if (body.starts_at !== undefined || body.ends_at !== undefined) {
    if (existing.status === "closed") {
      return NextResponse.json(
        { error: "Cannot edit closed poll window — use /reopen" },
        { status: 400 }
      );
    }
    const newStart = body.starts_at ?? existing.starts_at;
    const newEnd = body.ends_at ?? existing.ends_at;
    if (newStart && newEnd) {
      if (new Date(newEnd) <= new Date(newStart)) {
        return NextResponse.json(
          { error: "ends_at must be after starts_at" },
          { status: 400 }
        );
      }
      const conflicts = await findOverlappingPolls(adminClient, newStart, newEnd, id);
      if (conflicts.length > 0) {
        return NextResponse.json(
          { error: "Window overlaps another poll", conflicts },
          { status: 409 }
        );
      }
      update.starts_at = newStart;
      update.ends_at = newEnd;
    } else {
      // Only allowed to clear windows on a draft
      if (existing.status !== "draft") {
        return NextResponse.json(
          { error: "Cannot clear window on non-draft poll" },
          { status: 400 }
        );
      }
      update.starts_at = newStart ?? null;
      update.ends_at = newEnd ?? null;
    }
  }

  if (Object.keys(update).length > 0) {
    const { error: pollErr } = await adminClient
      .from("polls")
      .update(update)
      .eq("id", id);
    if (pollErr) {
      return NextResponse.json({ error: pollErr.message }, { status: 500 });
    }
  }

  // Sync questions/options if provided
  if (Array.isArray(body.questions)) {
    if (body.questions.length === 0) {
      return NextResponse.json(
        { error: "at least one question is required" },
        { status: 400 }
      );
    }

    const incomingQIds = new Set(
      body.questions.filter((q) => q.id).map((q) => q.id as string)
    );
    const existingQIds = new Set(existing.questions.map((q) => q.id));

    // Delete questions that are no longer in the payload (cascades to answers)
    const toDeleteQ = [...existingQIds].filter((qid) => !incomingQIds.has(qid));
    if (toDeleteQ.length > 0) {
      const { error } = await adminClient
        .from("poll_questions")
        .delete()
        .in("id", toDeleteQ);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Upsert each incoming question, then sync its options
    for (let i = 0; i < body.questions.length; i++) {
      const q = body.questions[i];
      if (!q.question_text?.trim()) {
        return NextResponse.json({ error: "question_text required" }, { status: 400 });
      }
      if (!["single", "multi", "text"].includes(q.question_type)) {
        return NextResponse.json({ error: "invalid question_type" }, { status: 400 });
      }

      const qFields = {
        question_text: q.question_text.trim(),
        question_type: q.question_type,
        max_selections:
          q.question_type === "multi" ? q.max_selections ?? null : null,
        max_length: q.question_type === "text" ? q.max_length ?? 500 : null,
        order_index: q.order_index ?? i,
      };

      let questionId = q.id;
      if (questionId && existingQIds.has(questionId)) {
        const { error } = await adminClient
          .from("poll_questions")
          .update(qFields)
          .eq("id", questionId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      } else {
        const { data: inserted, error } = await adminClient
          .from("poll_questions")
          .insert({ ...qFields, poll_id: id })
          .select()
          .single();
        if (error || !inserted) {
          return NextResponse.json(
            { error: error?.message || "Failed to add question" },
            { status: 500 }
          );
        }
        questionId = inserted.id;
      }

      // Sync options (only for select-type questions; text type has no options)
      const existingQuestion = existing.questions.find((eq) => eq.id === questionId);
      const existingOIds = new Set(
        (existingQuestion?.options || []).map((o) => o.id)
      );
      const incomingOpts = q.options || [];
      const incomingOIds = new Set(
        incomingOpts.filter((o) => o.id).map((o) => o.id as string)
      );

      if (q.question_type === "text") {
        // Drop any leftover options for a question that became text-type
        if (existingOIds.size > 0) {
          await adminClient
            .from("poll_options")
            .delete()
            .in("id", [...existingOIds]);
        }
        continue;
      }

      if (incomingOpts.length < 2) {
        return NextResponse.json(
          { error: "select questions need at least 2 options" },
          { status: 400 }
        );
      }

      const toDeleteO = [...existingOIds].filter((oid) => !incomingOIds.has(oid));
      if (toDeleteO.length > 0) {
        const { error } = await adminClient
          .from("poll_options")
          .delete()
          .in("id", toDeleteO);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      }

      for (let j = 0; j < incomingOpts.length; j++) {
        const o = incomingOpts[j];
        if (!o.option_text?.trim()) {
          return NextResponse.json({ error: "option_text required" }, { status: 400 });
        }
        const oFields = {
          option_text: o.option_text.trim(),
          order_index: o.order_index ?? j,
        };
        if (o.id && existingOIds.has(o.id)) {
          const { error } = await adminClient
            .from("poll_options")
            .update(oFields)
            .eq("id", o.id);
          if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
        } else {
          const { error } = await adminClient
            .from("poll_options")
            .insert({ ...oFields, question_id: questionId });
          if (error)
            return NextResponse.json({ error: error.message }, { status: 500 });
        }
      }
    }
  }

  const updated = await loadPollWithQuestions(adminClient, id);
  return NextResponse.json({ poll: updated });
}

/**
 * @swagger
 * /api/admin/polls/{id}:
 *   delete:
 *     summary: Delete a poll (admin). Cascades to questions, options, responses, answers.
 *     tags: [Admin, Polls]
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const admin = await checkIsAdmin();
  if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const adminClient = createAdminClient();

  const { error } = await adminClient.from("polls").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
