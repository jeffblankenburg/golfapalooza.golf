import type { SupabaseClient } from "@supabase/supabase-js";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { computePlacePayouts, LAST_PLACE, placeLabel, type PlacePayout, type PayoutSplit } from "./payouts";
import {
  propsConfigOf, rankProps, provisionalPropWinnings,
  maxPoints as maxPointsOf, allSettled, isPropsLocked, YES_NO_CHOICES,
  type PropQuestion, type PropAnswer, type PropChoice, type PropType, type NumericRule,
} from "./props";

/**
 * Server wiring for the Props contest (#243): assemble the member board (questions + my
 * answers + leaderboard + money), record a member answer, and the admin author/settle
 * actions. Scope-agnostic — operates on a contestId whether event- or group-scoped; route
 * handlers in both URL namespaces are thin shells. Mirrors pickem-server.ts.
 */

export type PropsResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const QUESTION_SELECT =
  "id, contest_id, sort_order, prompt, qtype, choices, line, points, numeric_rule, format, image_url, answer_text, answer_number, voided";

interface QuestionRow {
  id: string; contest_id: string; sort_order: number; prompt: string; qtype: PropType;
  choices: PropChoice[] | null; line: number | null; points: number; numeric_rule: NumericRule | null;
  format: "number" | "duration" | null; image_url: string | null; answer_text: string | null; answer_number: number | null; voided: boolean;
}

function mapQuestion(r: QuestionRow): PropQuestion {
  return {
    id: r.id, sortOrder: r.sort_order, prompt: r.prompt, qtype: r.qtype,
    choices: Array.isArray(r.choices) ? r.choices : [],
    line: r.line != null ? Number(r.line) : null,
    points: Number(r.points) || 0,
    numericRule: r.numeric_rule ?? null,
    format: r.format ?? null,
    imageUrl: r.image_url ?? null,
    answerText: r.answer_text ?? null,
    answerNumber: r.answer_number != null ? Number(r.answer_number) : null,
    voided: !!r.voided,
  };
}

/** Normalize an incoming image URL (trim; empty → null). Accepts GIPHY hotlinks + our bucket URLs. */
function cleanImageUrl(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s ? s.slice(0, 2048) : null;
}

/** List a contest's questions in display order. */
export async function listQuestions(admin: SupabaseClient, contestId: string): Promise<PropQuestion[]> {
  const { data } = await admin.from("v2_prop_questions").select(QUESTION_SELECT).eq("contest_id", contestId).order("sort_order");
  return ((data ?? []) as unknown as QuestionRow[]).map(mapQuestion);
}

/** Does any member answer exist on this question? (freezes its structural fields). */
async function questionHasAnswers(admin: SupabaseClient, questionId: string): Promise<boolean> {
  const { count } = await admin.from("v2_prop_answers").select("id", { count: "exact", head: true }).eq("question_id", questionId);
  return (count ?? 0) > 0;
}

/** Build the stored choice list for a question from raw admin input. */
function buildChoices(qtype: PropType, raw: unknown, existing: PropChoice[] = []): PropChoice[] {
  if (qtype === "yes_no") return YES_NO_CHOICES;
  if (qtype !== "multiple_choice") return [];
  const arr = Array.isArray(raw) ? raw : [];
  return arr
    .map((c, i) => {
      const label = (typeof c === "string" ? c : (c as { label?: string })?.label ?? "").trim();
      const id = (typeof c === "object" && c && (c as { id?: string }).id) || existing[i]?.id || `c${i + 1}`;
      return { id: String(id), label };
    })
    .filter((c) => c.label.length > 0);
}

export interface AddQuestionInput {
  prompt?: string; qtype?: PropType; choices?: unknown; line?: number | null;
  points?: number; numericRule?: NumericRule | null; format?: "number" | "duration" | null; imageUrl?: string | null;
}

/** Add one question to the set (admin). */
export async function addQuestion(admin: SupabaseClient, contestId: string, body: AddQuestionInput): Promise<PropsResult<PropQuestion>> {
  const prompt = (body.prompt ?? "").trim();
  if (!prompt) return { ok: false, status: 400, error: "A question is required" };
  const qtype = body.qtype;
  if (!qtype || !["multiple_choice", "yes_no", "numeric", "over_under"].includes(qtype)) return { ok: false, status: 400, error: "Pick a question type" };

  const choices = buildChoices(qtype, body.choices);
  if (qtype === "multiple_choice" && choices.length < 2) return { ok: false, status: 400, error: "Give at least two choices" };
  const line = qtype === "over_under" ? (typeof body.line === "number" ? body.line : null) : null;
  if (qtype === "over_under" && line == null) return { ok: false, status: 400, error: "Set the over/under line" };

  const { data: last } = await admin.from("v2_prop_questions").select("sort_order").eq("contest_id", contestId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await admin.from("v2_prop_questions").insert({
    contest_id: contestId, prompt, qtype, choices, line,
    points: Math.max(1, Math.round(Number(body.points) || 1)),
    numeric_rule: body.numericRule ?? null,
    format: qtype === "numeric" ? (body.format ?? null) : null,
    image_url: cleanImageUrl(body.imageUrl),
    sort_order: (last?.sort_order ?? -1) + 1,
  }).select(QUESTION_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: mapQuestion(data as unknown as QuestionRow) };
}

/** Edit a question's authoring fields (admin). Structural fields (type/choices/line) freeze
 *  once any answer exists; prompt/points/rule/format stay editable. Settlement is separate. */
export async function patchQuestion(admin: SupabaseClient, contestId: string, body: Record<string, unknown>): Promise<PropsResult<PropQuestion>> {
  const questionId = body.questionId as string | undefined;
  if (!questionId) return { ok: false, status: 400, error: "questionId required" };
  const { data: cur } = await admin.from("v2_prop_questions").select(QUESTION_SELECT).eq("id", questionId).eq("contest_id", contestId).maybeSingle();
  if (!cur) return { ok: false, status: 404, error: "Question not found" };
  const q = mapQuestion(cur as unknown as QuestionRow);

  const touchesStructure = "qtype" in body || "choices" in body || "line" in body;
  if (touchesStructure && (await questionHasAnswers(admin, questionId))) {
    return { ok: false, status: 409, error: "Members have already answered — the type, choices and line are locked." };
  }

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const nextType = (body.qtype as PropType) ?? q.qtype;
  if (typeof body.prompt === "string") { if (!body.prompt.trim()) return { ok: false, status: 400, error: "A question is required" }; patch.prompt = body.prompt.trim(); }
  if ("qtype" in body) patch.qtype = nextType;
  if ("choices" in body || "qtype" in body) {
    const choices = buildChoices(nextType, "choices" in body ? body.choices : q.choices, q.choices);
    if (nextType === "multiple_choice" && choices.length < 2) return { ok: false, status: 400, error: "Give at least two choices" };
    patch.choices = choices;
  }
  if ("line" in body || "qtype" in body) {
    const line = nextType === "over_under" ? (typeof body.line === "number" ? body.line : (("line" in body) ? null : q.line)) : null;
    if (nextType === "over_under" && line == null) return { ok: false, status: 400, error: "Set the over/under line" };
    patch.line = line;
  }
  if ("points" in body) patch.points = Math.max(1, Math.round(Number(body.points) || 1));
  if ("numericRule" in body) patch.numeric_rule = (body.numericRule as NumericRule) || null;
  if ("format" in body) patch.format = nextType === "numeric" ? ((body.format as "number" | "duration") || null) : null;
  if ("imageUrl" in body) patch.image_url = cleanImageUrl(body.imageUrl);

  const { data, error } = await admin.from("v2_prop_questions").update(patch).eq("id", questionId).eq("contest_id", contestId).select(QUESTION_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: mapQuestion(data as unknown as QuestionRow) };
}

/** Settle (or clear) a question's correct answer (admin). O/U equal to the line = push → void. */
export async function settleQuestion(admin: SupabaseClient, contestId: string, body: Record<string, unknown>): Promise<PropsResult<PropQuestion>> {
  const questionId = body.questionId as string | undefined;
  if (!questionId) return { ok: false, status: 400, error: "questionId required" };
  const { data: cur } = await admin.from("v2_prop_questions").select(QUESTION_SELECT).eq("id", questionId).eq("contest_id", contestId).maybeSingle();
  if (!cur) return { ok: false, status: 404, error: "Question not found" };
  const q = mapQuestion(cur as unknown as QuestionRow);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.clear === true) {
    patch.answer_text = null; patch.answer_number = null; patch.voided = false;
  } else if (q.qtype === "numeric") {
    if (typeof body.answerNumber !== "number") return { ok: false, status: 400, error: "Enter the correct number" };
    patch.answer_number = body.answerNumber; patch.answer_text = null;
  } else if (q.qtype === "over_under") {
    if (typeof body.answerNumber !== "number") return { ok: false, status: 400, error: "Enter the actual value" };
    patch.answer_number = body.answerNumber; patch.answer_text = null;
    patch.voided = q.line != null && body.answerNumber === q.line; // push → void
  } else {
    const choiceId = String(body.answerText ?? "");
    if (!q.choices.some((c) => c.id === choiceId)) return { ok: false, status: 400, error: "Pick the correct choice" };
    patch.answer_text = choiceId; patch.answer_number = null;
  }

  const { data, error } = await admin.from("v2_prop_questions").update(patch).eq("id", questionId).eq("contest_id", contestId).select(QUESTION_SELECT).single();
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: mapQuestion(data as unknown as QuestionRow) };
}

/** Void / un-void a question (admin). Voided = dropped from everyone's scoring + max total. */
export async function voidQuestion(admin: SupabaseClient, contestId: string, questionId: string | null, voided: boolean): Promise<PropsResult<null>> {
  if (!questionId) return { ok: false, status: 400, error: "questionId required" };
  const { error } = await admin.from("v2_prop_questions").update({ voided, updated_at: new Date().toISOString() }).eq("id", questionId).eq("contest_id", contestId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Reorder questions (admin): ordered list of question ids → sort_order. */
export async function reorderQuestions(admin: SupabaseClient, contestId: string, orderedIds: string[]): Promise<PropsResult<null>> {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return { ok: false, status: 400, error: "orderedIds required" };
  const stamp = new Date().toISOString();
  const results = await Promise.all(orderedIds.map((id, i) => admin.from("v2_prop_questions").update({ sort_order: i, updated_at: stamp }).eq("id", id).eq("contest_id", contestId)));
  const failed = results.find((r) => r.error);
  if (failed?.error) return { ok: false, status: 500, error: failed.error.message };
  return { ok: true, data: null };
}

/** Delete one question (admin). Cascades its answers. */
export async function deleteQuestion(admin: SupabaseClient, contestId: string, questionId: string | null): Promise<PropsResult<null>> {
  if (!questionId) return { ok: false, status: 400, error: "questionId required" };
  const { error } = await admin.from("v2_prop_questions").delete().eq("id", questionId).eq("contest_id", contestId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Clear every member answer (admin reset). Questions + settled results stay. */
export async function resetAnswers(admin: SupabaseClient, contestId: string): Promise<PropsResult<null>> {
  const { error } = await admin.from("v2_prop_answers").delete().eq("contest_id", contestId);
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

export interface SubmitAnswerInput { questionId?: string; choice?: string | null; number?: number | null }

/** Save one member answer. The whole set locks at config.locks_at. */
export async function submitAnswer(
  admin: SupabaseClient, contestId: string, userId: string, body: SubmitAnswerInput, now: Date, contestStatus: string,
): Promise<PropsResult<null>> {
  if (!body.questionId) return { ok: false, status: 400, error: "questionId required" };
  if (contestStatus !== "active") return { ok: false, status: 403, error: "This Props pool isn't open" };

  const { data: contest } = await admin.from("v2_contests").select("config").eq("id", contestId).maybeSingle();
  const cfg = propsConfigOf(contest?.config as Record<string, unknown> | null);
  if (isPropsLocked(cfg.locksAt, now)) return { ok: false, status: 403, error: "Answers are locked" };

  const { data: q } = await admin.from("v2_prop_questions").select("id, contest_id, qtype").eq("id", body.questionId).maybeSingle();
  if (!q || q.contest_id !== contestId) return { ok: false, status: 404, error: "Question not found" };

  const numeric = q.qtype === "numeric";
  const number = numeric && typeof body.number === "number" ? body.number : null;
  const choice = !numeric && typeof body.choice === "string" && body.choice ? body.choice : null;

  const { error } = await admin.from("v2_prop_answers").upsert(
    { question_id: body.questionId, contest_id: contestId, user_id: userId, choice, number, updated_at: new Date().toISOString() },
    { onConflict: "question_id,user_id" },
  );
  if (error) return { ok: false, status: 500, error: error.message };
  return { ok: true, data: null };
}

/** Create a Props contest. `eventId` string = event-scoped; null = group-scoped. */
export async function createProps(
  admin: SupabaseClient, input: { orgId: string; eventId: string | null; name: string; createdBy: string },
): Promise<{ id: string }> {
  const { data, error } = await admin.from("v2_contests").insert({
    org_id: input.orgId, event_id: input.eventId, contest_type: "props", name: input.name,
    scoring_source: "derived", status: "draft", auto_enroll: false, created_by: input.createdBy,
  }).select("id").single();
  if (error || !data) throw new Error(error?.message ?? "Could not create the contest");
  return { id: data.id as string };
}

// ----- Member board -------------------------------------------------------------------

export interface PropsLeaderEntry {
  userId: string; name: string; avatarUrl: string | null;
  points: number; correct: number; answered: number; rank: number;
  provisionalCents: number;
  answers: { questionId: string; choice: string | null; number: number | null }[] | null; // revealed once locked
}

export interface PropsBoard {
  questions: PropQuestion[];
  myAnswers: Record<string, { choice: string | null; number: number | null }>;
  leaderboard: PropsLeaderEntry[];
  locked: boolean;            // the set has locked (answers read-only)
  locksAt: string | null;
  numericRule: NumericRule;   // the set default
  settled: boolean;           // every live question settled → final
  totalQuestions: number;
  maxPoints: number;
  potCents: number;
  placePayouts: PlacePayout[];
}

/** Load everything the member Props UI needs. Individual answers reveal once the set locks. */
export async function loadPropsBoard(
  supabase: SupabaseClient, input: { contestId: string; orgId: string; viewerId: string; now: Date },
): Promise<PropsBoard> {
  const questions = await listQuestions(supabase, input.contestId);

  const [{ data: answerRows }, { data: contest }, { count: entrantCount }] = await Promise.all([
    supabase.from("v2_prop_answers").select("question_id, user_id, choice, number").eq("contest_id", input.contestId),
    supabase.from("v2_contests").select("config, payout_splits").eq("id", input.contestId).maybeSingle(),
    supabase.from("v2_contest_participants").select("user_id", { count: "exact", head: true }).eq("contest_id", input.contestId),
  ]);
  const answers: PropAnswer[] = (answerRows ?? []).map((a) => ({
    questionId: a.question_id as string, userId: a.user_id as string,
    choice: (a.choice as string | null) ?? null, number: a.number != null ? Number(a.number) : null,
  }));

  const cfg = propsConfigOf(contest?.config as Record<string, unknown> | null);
  const locked = isPropsLocked(cfg.locksAt, input.now);
  const splits = (contest?.payout_splits as PayoutSplit[] | null) ?? null;
  const potCents = cfg.entryCents * (entrantCount ?? 0);
  const placePayouts = computePlacePayouts(potCents, splits);

  const userIds = [...new Set(answers.map((a) => a.userId))];
  const ranked = rankProps(questions, answers, userIds, cfg.numericRule);
  const provisional = provisionalPropWinnings(questions, answers, userIds, cfg.numericRule, potCents, splits);

  const [{ data: profs }, mode] = await Promise.all([
    userIds.length
      ? supabase.from("v2_profiles").select("id, display_name, first_name, last_name, nickname, avatar_url").in("id", userIds)
      : Promise.resolve({ data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; nickname: string | null; avatar_url: string | null }[] }),
    orgNameMode(supabase, input.orgId),
  ]);
  const prof = new Map((profs || []).map((p) => [p.id as string, p]));

  const answersByUser = new Map<string, PropAnswer[]>();
  for (const a of answers) (answersByUser.get(a.userId) ?? answersByUser.set(a.userId, []).get(a.userId)!).push(a);

  const leaderboard: PropsLeaderEntry[] = ranked.map((r) => ({
    userId: r.userId,
    name: prof.has(r.userId) ? pickName(prof.get(r.userId)!, mode) : "Member",
    avatarUrl: (prof.get(r.userId)?.avatar_url as string | null) ?? null,
    points: r.points, correct: r.correct, answered: r.answered, rank: r.rank,
    provisionalCents: provisional.get(r.userId) ?? 0,
    // Reveal everyone's answers only once the set locks (no peeking before).
    answers: locked ? (answersByUser.get(r.userId) ?? []).map((a) => ({ questionId: a.questionId, choice: a.choice, number: a.number })) : null,
  }));

  const myAnswers: Record<string, { choice: string | null; number: number | null }> = {};
  for (const a of answers) if (a.userId === input.viewerId) myAnswers[a.questionId] = { choice: a.choice, number: a.number };

  return {
    questions, myAnswers, leaderboard, locked, locksAt: cfg.locksAt, numericRule: cfg.numericRule,
    settled: allSettled(questions), totalQuestions: questions.length, maxPoints: maxPointsOf(questions),
    potCents, placePayouts,
  };
}

// ----- Admin payouts (place-based; mirrors loadAuctionPayouts) -------------------------

export interface PropsPrize { place: number; label: string; amountCents: number; winnerId: string | null; winnerName: string | null }
export interface PropsWinner { userId: string; name: string; wonCents: number; place: number; paidCents: number }
export interface PropsPayouts { ready: boolean; potCents: number; totalCents: number; prizes: PropsPrize[]; winners: PropsWinner[] }

/** Sort key so the LAST_PLACE sentinel orders after real places. */
const placeRank = (place: number) => (place === LAST_PLACE ? Number.MAX_SAFE_INTEGER : place);

/**
 * Props payouts by LEADERBOARD PLACE: the pot (entry × entrants) resolved over payout_splits,
 * each place mapped to its current leader, aggregated per winner with their settled total
 * (source='winnings' credits). Ready once every live question is settled. Mirrors
 * loadAuctionPayouts / loadPickemPayouts.
 */
export async function loadPropsPayouts(admin: SupabaseClient, contestId: string, nameMode: NameMode): Promise<PropsPayouts | null> {
  const { data: contest } = await admin.from("v2_contests").select("config, payout_splits").eq("id", contestId).maybeSingle();
  if (!contest) return null;
  const cfg = propsConfigOf(contest.config as Record<string, unknown> | null);

  const [questions, { data: answerRows }, { data: parts }] = await Promise.all([
    listQuestions(admin, contestId),
    admin.from("v2_prop_answers").select("question_id, user_id, choice, number").eq("contest_id", contestId),
    admin.from("v2_contest_participants").select("user_id").eq("contest_id", contestId),
  ]);
  const answers: PropAnswer[] = (answerRows ?? []).map((a) => ({
    questionId: a.question_id as string, userId: a.user_id as string,
    choice: (a.choice as string | null) ?? null, number: a.number != null ? Number(a.number) : null,
  }));
  const userIds = [...new Set(answers.map((a) => a.userId))];
  const potCents = cfg.entryCents * (parts ?? []).length;
  const place = computePlacePayouts(potCents, (contest.payout_splits as PayoutSplit[] | null) ?? null);
  const ranked = rankProps(questions, answers, userIds, cfg.numericRule);
  const ready = allSettled(questions);

  const nameOf = async (ids: string[]) => {
    if (!ids.length) return new Map<string, string>();
    const { data } = await admin.from("v2_profiles").select("id, display_name, first_name, last_name, nickname").in("id", ids);
    return new Map((data ?? []).map((p) => [p.id as string, pickName(p, nameMode, "Member")]));
  };
  const leaderByPlace = new Map<number, string>();
  for (const r of ranked) if (!leaderByPlace.has(r.rank)) leaderByPlace.set(r.rank, r.userId);
  // The bottom-ranked finisher (first of a tied-last group) wins any LAST_PLACE prize.
  const maxRank = ranked.reduce((m, r) => Math.max(m, r.rank), 0);
  const lastRankUserId = maxRank > 0 ? ranked.find((r) => r.rank === maxRank)?.userId ?? null : null;
  const names = await nameOf([...new Set([...leaderByPlace.values(), ...(lastRankUserId ? [lastRankUserId] : [])])]);

  const prizes: PropsPrize[] = place
    .filter((p) => p.amountCents > 0)
    .map((p) => {
      const winnerId = p.place === LAST_PLACE ? lastRankUserId : leaderByPlace.get(p.place) ?? null;
      return { place: p.place, label: `${placeLabel(p.place)} place`, amountCents: p.amountCents, winnerId, winnerName: winnerId ? names.get(winnerId) ?? "Member" : null };
    });
  const totalCents = prizes.reduce((s, p) => s + p.amountCents, 0);

  // Aggregate per winner + settled credits. Keep the best (top-most) place for display if a
  // player somehow holds two (only in a degenerate tiny field).
  const byWinner = new Map<string, { won: number; place: number }>();
  for (const p of prizes) {
    if (!p.winnerId) continue;
    const cur = byWinner.get(p.winnerId) ?? { won: 0, place: p.place };
    cur.won += p.amountCents; cur.place = placeRank(p.place) < placeRank(cur.place) ? p.place : cur.place;
    byWinner.set(p.winnerId, cur);
  }
  const { data: credits } = byWinner.size
    ? await admin.from("v2_financial_transactions").select("user_id, amount_cents").eq("contest_id", contestId).eq("type", "payment").eq("source", "winnings")
    : { data: [] as { user_id: string; amount_cents: number }[] };
  const paidByUser = new Map<string, number>();
  for (const c of credits ?? []) paidByUser.set(c.user_id as string, (paidByUser.get(c.user_id as string) || 0) + ((c.amount_cents as number) || 0));

  const winners: PropsWinner[] = [...byWinner.entries()]
    .map(([userId, v]) => ({ userId, name: names.get(userId) ?? "Member", wonCents: v.won, place: v.place, paidCents: paidByUser.get(userId) || 0 }))
    .sort((a, b) => placeRank(a.place) - placeRank(b.place) || b.wonCents - a.wonCents);

  return { ready, potCents, totalCents, prizes, winners };
}
