/**
 * Props contest (#243) — pure logic. An admin authors proposition questions (multiple
 * choice, yes/no, numeric, over/under); members answer one per question before a single
 * lock; the admin enters the correct answer manually afterward. Points per question (a
 * weight) go to whoever got it right — exact for choice questions, closest for numeric
 * (by an admin-chosen rule). A voided question is dropped from everyone's scoring and the
 * max-points total. Server wiring lives in props-server.ts.
 *
 * Architecturally a generalized Pick'em: the leaderboard feeds the same shared payout
 * engine (computePlacePayouts + distributePlacePayouts), so money works identically.
 */

import { computePlacePayouts, distributePlacePayouts, type PayoutSplit } from "./payouts";

export type PropType = "multiple_choice" | "yes_no" | "numeric" | "over_under";
export const PROP_TYPES: { value: PropType; label: string }[] = [
  { value: "multiple_choice", label: "Multiple choice" },
  { value: "yes_no", label: "Yes / No" },
  { value: "numeric", label: "Number" },
  { value: "over_under", label: "Over / Under" },
];

/** How a numeric guess is graded. A contest-level default (config) with an optional
 *  per-question override. */
export type NumericRule = "absolute" | "no_over" | "exact";
export const NUMERIC_RULES: { value: NumericRule; label: string; hint: string }[] = [
  { value: "absolute", label: "Closest guess wins", hint: "Smallest difference from the answer, over or under." },
  { value: "no_over", label: "Closest without going over", hint: "Price-Is-Right: guesses above the answer don't count." },
  { value: "exact", label: "Exact answer only", hint: "Only an exact match scores." },
];

export interface PropChoice { id: string; label: string }

export interface PropQuestion {
  id: string;
  sortOrder: number;
  prompt: string;
  qtype: PropType;
  choices: PropChoice[];                 // multiple_choice / yes_no
  line: number | null;                   // over_under
  points: number;                        // weight toward the total
  numericRule: NumericRule | null;       // per-question override (null = use the set default)
  format: "number" | "duration" | null;  // numeric display hint
  imageUrl: string | null;               // optional image/GIF shown with the question
  answerText: string | null;             // settled correct choice id (MC/YN) or 'over'/'under'
  answerNumber: number | null;           // settled correct number (numeric) or O/U actual
  voided: boolean;
}

export interface PropAnswer {
  questionId: string;
  userId: string;
  choice: string | null;  // choice id / 'over' / 'under'
  number: number | null;  // numeric guess
}

export interface PropLeaderRow {
  userId: string;
  points: number;    // total earned on settled, non-void questions
  correct: number;   // # settled questions they scored on
  answered: number;  // # live (non-void) questions they answered
  rank: number;      // 1-based, ties share (1,2,2,4)
}

export interface PropsConfig {
  locksAt: string | null;      // ISO; the whole set locks here (required to open to members)
  numericRule: NumericRule;    // set default for numeric questions without an override
  entryCents: number;          // real-money buy-in per player (0 = free)
}

/** Read a Props config off a contest's config JSON. */
export function propsConfigOf(config: Record<string, unknown> | null | undefined): PropsConfig {
  const c = config ?? {};
  return {
    locksAt: typeof c.locks_at === "string" && c.locks_at ? c.locks_at : null,
    numericRule: (["absolute", "no_over", "exact"] as const).includes(c.numeric_rule as NumericRule) ? (c.numeric_rule as NumericRule) : "absolute",
    entryCents: Number(c.entry_cents) || 0,
  };
}

/** Yes/No questions always carry these two choices (so scoring is identical to MC). */
export const YES_NO_CHOICES: PropChoice[] = [{ id: "yes", label: "Yes" }, { id: "no", label: "No" }];

/** The whole set locks at one time; before that answers are editable. */
export function isPropsLocked(locksAt: string | null, now: Date): boolean {
  return locksAt != null && now.getTime() >= new Date(locksAt).getTime();
}

/** Does a question have a usable answer (choice present, or a number) for scoring? */
export function answerIsFilled(a: PropAnswer | undefined | null): boolean {
  return !!a && (a.choice != null || a.number != null);
}

/** The effective numeric rule for a question (its override, else the set default). */
export function ruleFor(q: PropQuestion, setDefault: NumericRule): NumericRule {
  return q.numericRule ?? setDefault;
}

/**
 * The correct side/choice for a question once settled (null = not yet settled / voided).
 * For over/under it's derived from the actual value vs. the line (equal = push → null; the
 * settle API voids a push so this won't normally be reached).
 */
export function correctChoiceFor(q: PropQuestion): string | null {
  if (q.voided) return null;
  if (q.qtype === "over_under") {
    if (q.answerNumber == null || q.line == null) return null;
    return q.answerNumber > q.line ? "over" : q.answerNumber < q.line ? "under" : null;
  }
  return q.answerText; // MC / YN choice id
}

/** Is a question settled (has a gradeable result) and live (not voided)? */
export function questionSettled(q: PropQuestion): boolean {
  if (q.voided) return false;
  if (q.qtype === "numeric") return q.answerNumber != null;
  if (q.qtype === "over_under") return correctChoiceFor(q) != null;
  return q.answerText != null; // MC / YN
}

/**
 * The winning userIds on a settled NUMERIC question, by its effective rule. Co-winners tie
 * (each earns the full points). Only answers with a number count.
 */
export function numericWinners(q: PropQuestion, answers: PropAnswer[], setDefault: NumericRule): Set<string> {
  const target = q.answerNumber;
  if (target == null) return new Set();
  const entries = answers.filter((a) => a.number != null).map((a) => ({ userId: a.userId, n: a.number as number }));
  if (entries.length === 0) return new Set();
  const rule = ruleFor(q, setDefault);

  if (rule === "exact") return new Set(entries.filter((e) => e.n === target).map((e) => e.userId));

  if (rule === "no_over") {
    const notOver = entries.filter((e) => e.n <= target);
    if (notOver.length === 0) return new Set(); // everyone went over → nobody scores
    const best = Math.max(...notOver.map((e) => e.n)); // closest from below
    return new Set(notOver.filter((e) => e.n === best).map((e) => e.userId));
  }

  // absolute: smallest |guess − target|
  const best = Math.min(...entries.map((e) => Math.abs(e.n - target)));
  return new Set(entries.filter((e) => Math.abs(e.n - target) === best).map((e) => e.userId));
}

/**
 * Whether a user's answer scored on a settled question (null = question not settled). For
 * numeric, pass the precomputed winner set for the question.
 */
export function answerScored(q: PropQuestion, a: PropAnswer | undefined, numericWinnerSet?: Set<string>): boolean | null {
  if (!questionSettled(q)) return null;
  if (!a) return false;
  if (q.qtype === "numeric") return !!numericWinnerSet?.has(a.userId);
  return a.choice != null && a.choice === correctChoiceFor(q);
}

/** The maximum points available (sum over live, non-void questions). */
export function maxPoints(questions: PropQuestion[]): number {
  return questions.filter((q) => !q.voided).reduce((s, q) => s + Math.max(0, q.points), 0);
}

/** Every live (non-void) question has been settled → the leaderboard is final. */
export function allSettled(questions: PropQuestion[]): boolean {
  const live = questions.filter((q) => !q.voided);
  return live.length > 0 && live.every(questionSettled);
}

/**
 * Build the leaderboard: total points DESC, ties sharing rank (1,2,2,4). Numeric winners are
 * computed per question once; choice questions grade directly. `userIds` seeds the board so a
 * member who hasn't answered still appears (at 0).
 */
export function rankProps(questions: PropQuestion[], answers: PropAnswer[], userIds: string[], setDefault: NumericRule): PropLeaderRow[] {
  const live = questions.filter((q) => !q.voided);
  const answersByQ = new Map<string, PropAnswer[]>();
  for (const a of answers) (answersByQ.get(a.questionId) ?? answersByQ.set(a.questionId, []).get(a.questionId)!).push(a);
  const answerByQU = new Map<string, PropAnswer>();
  for (const a of answers) answerByQU.set(`${a.questionId}:${a.userId}`, a);

  // Precompute numeric winners per settled numeric question.
  const winnersByQ = new Map<string, Set<string>>();
  for (const q of live) if (q.qtype === "numeric" && questionSettled(q)) winnersByQ.set(q.id, numericWinners(q, answersByQ.get(q.id) ?? [], setDefault));

  const ids = [...new Set([...userIds, ...answers.map((a) => a.userId)])];
  const rows = ids.map((userId) => {
    let points = 0, correct = 0, answered = 0;
    for (const q of live) {
      const a = answerByQU.get(`${q.id}:${userId}`);
      if (answerIsFilled(a)) answered++;
      const scored = answerScored(q, a, winnersByQ.get(q.id));
      if (scored) { points += Math.max(0, q.points); correct++; }
    }
    return { userId, points, correct, answered, rank: 0 };
  });

  rows.sort((a, b) => b.points - a.points || b.correct - a.correct || a.userId.localeCompare(b.userId));
  let rank = 0, prevPts: number | null = null, prevCorrect: number | null = null;
  rows.forEach((r, i) => {
    if (prevPts === null || r.points !== prevPts || r.correct !== prevCorrect) rank = i + 1; // ties share, next gap skips
    r.rank = rank;
    prevPts = r.points; prevCorrect = r.correct;
  });
  return rows;
}

/**
 * Provisional ("if it ends now") winnings per user: rank the board as it stands, resolve the
 * pot into place amounts, and distribute with tie-pooling — the SAME math the admin settlement
 * uses. Empty until at least one question is settled (before then everyone's tied at 0).
 */
export function provisionalPropWinnings(
  questions: PropQuestion[], answers: PropAnswer[], userIds: string[], setDefault: NumericRule,
  potCents: number, splits: PayoutSplit[] | null | undefined,
): Map<string, number> {
  if (potCents <= 0 || !questions.some(questionSettled)) return new Map();
  const placePayouts = computePlacePayouts(potCents, splits);
  if (placePayouts.length === 0) return new Map();
  return distributePlacePayouts(rankProps(questions, answers, userIds, setDefault), placePayouts);
}
