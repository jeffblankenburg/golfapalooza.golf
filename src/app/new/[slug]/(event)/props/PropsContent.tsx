"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import { subscribeToProps } from "@/lib/v2/realtime/props-channel";
import {
  correctChoiceFor, questionSettled, numericWinners, type PropQuestion, type PropAnswer, type NumericRule,
} from "@/lib/v2/contests/props";
import { placeLabel } from "@/lib/v2/contests/payouts";
import type { PropsLeaderEntry } from "@/lib/v2/contests/props-server";
/* eslint-disable @next/next/no-img-element */

type MyAnswer = { choice: string | null; number: number | null };

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th"}`;

/** Display a numeric value, as mm:ss when the question is a duration. */
function fmtNumber(n: number | null | undefined, format: "number" | "duration" | null): string {
  if (n == null) return "—";
  if (format === "duration") {
    const s = Math.max(0, Math.round(n));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  return n.toLocaleString("en-US");
}

/** The label for a question's correct answer, once settled. */
function correctLabel(q: PropQuestion): string {
  if (q.qtype === "numeric") return fmtNumber(q.answerNumber, q.format);
  if (q.qtype === "over_under") {
    const side = correctChoiceFor(q);
    return `${side === "over" ? "Over" : side === "under" ? "Under" : "Push"} (${fmtNumber(q.answerNumber, null)})`;
  }
  return q.choices.find((c) => c.id === correctChoiceFor(q))?.label ?? "—";
}

export default function PropsContent({
  contestId, answerUrl, questions, initialAnswers, leaderboard, locked, locksAt, numericRule, settled,
  meId, totalQuestions, maxPoints, potCents = 0, placePayouts = [],
}: {
  contestId: string;
  answerUrl: string;
  questions: PropQuestion[];
  initialAnswers: Record<string, MyAnswer>;
  leaderboard: PropsLeaderEntry[];
  locked: boolean;           // the set has locked (answers read-only)
  locksAt: string | null;
  numericRule: NumericRule;  // set default (for grading numeric)
  settled: boolean;          // every live question settled → final
  meId: string;
  totalQuestions: number;
  maxPoints: number;
  potCents?: number;
  placePayouts?: { place: number; amountCents: number }[];
}) {
  const [tab, setTab] = useState<"answers" | "leaderboard">("answers");
  const [answers, setAnswers] = useState<Record<string, MyAnswer>>(initialAnswers);
  const [expanded, setExpanded] = useState<string | null>(null);
  const router = useRouter();

  // Live: answers landing + results being entered re-render the server board.
  useEffect(() => {
    const unsub = subscribeToProps(contestId, () => router.refresh());
    return () => { unsub(); };
  }, [contestId, router]);

  async function save(questionId: string, next: MyAnswer) {
    const prev = answers[questionId];
    setAnswers((s) => ({ ...s, [questionId]: next }));
    try {
      const res = await fetch(answerUrl, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questionId, choice: next.choice, number: next.number }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAnswers((s) => ({ ...s, [questionId]: prev ?? { choice: null, number: null } }));
    }
  }

  // All revealed answers (post-lock) → numeric winner sets per question, for right/wrong coloring.
  const allAnswers: PropAnswer[] = useMemo(
    () => leaderboard.flatMap((e) => (e.answers ?? []).map((a) => ({ questionId: a.questionId, userId: e.userId, choice: a.choice, number: a.number }))),
    [leaderboard],
  );
  const numericWinnerByQ = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const q of questions) if (q.qtype === "numeric" && questionSettled(q)) m.set(q.id, numericWinners(q, allAnswers.filter((a) => a.questionId === q.id), numericRule));
    return m;
  }, [questions, allAnswers, numericRule]);

  // Money banner + per-row winnings, mirroring Pick'em: show the pot whenever there's one;
  // winnings only once a result lands (before then everyone's tied at 0).
  const payingPlaces = placePayouts.filter((p) => p.amountCents > 0);
  const hasMoney = potCents > 0 && payingPlaces.length > 0;
  const anyScored = questions.some(questionSettled);
  const showWinnings = hasMoney && anyScored;
  const me = leaderboard.find((e) => e.userId === meId);
  const cutIdx =
    showWinnings && leaderboard.some((e) => e.provisionalCents > 0)
      ? leaderboard.findIndex((e) => e.provisionalCents === 0)
      : -1;

  const rankCount = new Map<number, number>();
  for (const e of leaderboard) rankCount.set(e.rank, (rankCount.get(e.rank) ?? 0) + 1);
  const isTie = (rank: number) => anyScored && (rankCount.get(rank) ?? 0) > 1;
  const rankText = (rank: number) => (isTie(rank) ? `T${rank}` : String(rank));
  const rankPhrase = (rank: number) => `${isTie(rank) ? "tied for " : ""}${ordinal(rank)}`;

  const lockLabel = locksAt ? new Date(locksAt).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : null;

  /** One answerable question card. */
  function questionCard(q: PropQuestion) {
    const mine = answers[q.id] ?? { choice: null, number: null };
    const isSettled = questionSettled(q);
    const correct = isSettled ? correctChoiceFor(q) : null;
    const disabled = locked || q.voided;

    const choiceButtons = (opts: { id: string; label: string; sub?: string }[]) => (
      <div className={styles.propChoices}>
        {opts.map((o) => {
          const on = mine.choice === o.id;
          const win = isSettled && correct === o.id;        // the correct choice (green)
          const myResult = on && isSettled ? (correct === o.id) : null; // my pick right/wrong
          return (
            <button key={o.id} type="button" className={styles.propChoice} data-on={on || undefined} data-win={win || undefined} disabled={disabled}
              onClick={() => save(q.id, { choice: on ? null : o.id, number: null })}>
              <span>{o.label}</span>
              {o.sub && <span className={styles.propChoiceSub}>{o.sub}</span>}
              {myResult === true && <span className={styles.pickMark} data-ok>✓</span>}
              {myResult === false && <span className={styles.pickMark} data-bad>✗</span>}
            </button>
          );
        })}
      </div>
    );

    return (
      <div key={q.id} className={styles.pickCard}>
        <div className={styles.pickCardMeta} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{q.voided ? <span className={styles.propVoid}>Voided</span> : <span className={styles.propPts}>{q.points} {q.points === 1 ? "pt" : "pts"}</span>}</span>
        </div>
        <p style={{ margin: "0 0 10px", fontWeight: 700, fontSize: "0.95rem" }}>{q.prompt}</p>
        {q.imageUrl && <img src={q.imageUrl} alt="" className={styles.propImage} />}

        {(q.qtype === "multiple_choice" || q.qtype === "yes_no") && choiceButtons(q.choices)}
        {q.qtype === "over_under" && choiceButtons([
          { id: "over", label: "Over", sub: fmtNumber(q.line, null) },
          { id: "under", label: "Under", sub: fmtNumber(q.line, null) },
        ])}
        {q.qtype === "numeric" && (
          <input className={styles.input} inputMode="numeric" disabled={disabled}
            defaultValue={mine.number != null ? String(mine.number) : ""}
            placeholder={q.format === "duration" ? "seconds, e.g. 125" : "your number"}
            onBlur={(e) => {
              const raw = e.target.value.trim();
              const n = raw === "" ? null : Math.round(Number(raw));
              if (n !== (mine.number ?? null) && (raw === "" || Number.isFinite(n as number))) save(q.id, { choice: null, number: n });
            }} />
        )}

        {isSettled && (
          <p className={styles.propAnswerLine}>
            Correct answer: <strong>{correctLabel(q)}</strong>
            {q.qtype === "numeric" && mine.number != null && (
              numericWinnerByQ.get(q.id)?.has(meId)
                ? <span style={{ color: "#15803d", fontWeight: 700 }}>  You got it</span>
                : <span>  (you said {fmtNumber(mine.number, q.format)})</span>
            )}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={styles.module}>
      <div className={styles.segmented} style={{ marginBottom: 14 }}>
        <button type="button" className={styles.segmentBtn} data-on={tab === "answers" || undefined} onClick={() => setTab("answers")}>My Answers</button>
        <button type="button" className={styles.segmentBtn} data-on={tab === "leaderboard" || undefined} onClick={() => setTab("leaderboard")}>Leaderboard</button>
      </div>

      {tab === "answers" ? (
        questions.length === 0 ? (
          <p className={styles.dnsHint}>No questions posted yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {locked
              ? <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Answers are locked{settled ? ", results are final" : ", waiting on results"}.</p>
              : lockLabel && <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Answers lock {lockLabel}.</p>}
            {questions.map(questionCard)}
          </div>
        )
      ) : (
        leaderboard.length === 0 ? (
          <p className={styles.dnsHint}>No one has answered yet.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {hasMoney && (
              <div className={styles.pickPot}>
                <span className={styles.pickPotTotal}>{money(potCents)} pot</span>
                <div className={styles.pickPotPlaces}>
                  {payingPlaces.map((p) => (
                    <span key={p.place} className={styles.pickPotPlace}>
                      <span className={styles.pickPotAmt}>{money(p.amountCents)}</span>
                      <span className={styles.pickPotLbl}>{placeLabel(p.place)}</span>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {me && showWinnings && (
              <p className={styles.pickYouMoney} data-in={me.provisionalCents > 0 || undefined}>
                {me.provisionalCents > 0
                  ? (settled
                      ? <>You won <strong>{money(me.provisionalCents)}</strong> ({rankPhrase(me.rank)})</>
                      : <>You&apos;re {rankPhrase(me.rank)}, on track to win <strong>{money(me.provisionalCents)}</strong></>)
                  : (settled
                      ? <>You finished {rankPhrase(me.rank)}, out of the money</>
                      : <>You&apos;re {rankPhrase(me.rank)}, outside the paying places</>)}
              </p>
            )}
            {hasMoney && anyScored && !settled && <p className={styles.pickMoneyNote}>Winnings are projected if it ended now.</p>}

            {leaderboard.map((e, idx) => {
              const isMe = e.userId === meId;
              const canExpand = !!e.answers && e.answers.length > 0;
              return (
                <div key={e.userId}>
                  {idx === cutIdx && <div className={styles.pickCutLine}><span>Payout line</span></div>}
                  <button type="button" className={styles.pickLeaderRow} data-me={isMe || undefined}
                    onClick={() => canExpand && setExpanded(expanded === e.userId ? null : e.userId)} disabled={!canExpand}>
                    <span className={styles.pickRank}>{rankText(e.rank)}</span>
                    {e.avatarUrl ? <img src={e.avatarUrl} alt="" className={styles.pickAvatar} /> : <span className={styles.pickAvatarFallback}>{e.name.charAt(0).toUpperCase()}</span>}
                    <span className={styles.pickLeaderName}>{e.name}</span>
                    {showWinnings && e.provisionalCents > 0 && (
                      <span className={styles.pickMoney} title={settled ? "Winnings" : "Projected if it ends now"}>{money(e.provisionalCents)}</span>
                    )}
                    <span className={styles.pickLeaderStat}>
                      <span className={styles.pickLeaderScore}>{e.points}</span>
                      <span>{anyScored ? `${e.correct} right` : `${e.answered}/${totalQuestions} answered`}</span>
                    </span>
                  </button>
                  {canExpand && expanded === e.userId && (
                    <div className={styles.pickReveal}>
                      {questions.map((q) => {
                        const a = e.answers!.find((x) => x.questionId === q.id);
                        if (!a || (a.choice == null && a.number == null)) return null;
                        const label = q.qtype === "numeric"
                          ? fmtNumber(a.number, q.format)
                          : q.qtype === "over_under"
                            ? `${a.choice === "over" ? "Over" : "Under"} ${fmtNumber(q.line, null)}`
                            : q.choices.find((c) => c.id === a.choice)?.label ?? "—";
                        const ok = q.qtype === "numeric"
                          ? (questionSettled(q) ? numericWinnerByQ.get(q.id)?.has(e.userId) ?? false : null)
                          : (questionSettled(q) ? a.choice === correctChoiceFor(q) : null);
                        return <span key={q.id} className={styles.pickRevealChip} data-ok={ok === true || undefined} data-bad={ok === false || undefined} title={q.prompt}>{label}</span>;
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            <p className={styles.pickMoneyNote} style={{ marginTop: 6 }}>{maxPoints} {maxPoints === 1 ? "point" : "points"} possible across {totalQuestions} {totalQuestions === 1 ? "question" : "questions"}.</p>
          </div>
        )
      )}
    </div>
  );
}
