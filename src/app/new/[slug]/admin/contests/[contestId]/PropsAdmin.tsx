"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import { ContestTypeIcon } from "@/app/new/_components/contest-card/ContestCard";
import PayoutSplitsEditor from "../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
import { subscribeToProps } from "@/lib/v2/realtime/props-channel";
import { PROP_TYPES, NUMERIC_RULES, correctChoiceFor, questionSettled, type PropQuestion, type PropType, type NumericRule } from "@/lib/v2/contests/props";
import PropsPayouts from "./PropsPayouts";
import type { PropsPayouts as PropsPayoutsData } from "@/lib/v2/contests/props-server";
/* eslint-disable @next/next/no-img-element */

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

function isoToLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function localToISO(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

type Tab = "setup" | "questions" | "results";
type Act = (method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, qs?: string) => Promise<boolean>;

/**
 * Props admin — three focused views behind a segmented control so no single screen gets long:
 *   Setup     — name, status, lock, numeric rule, buy-in, payouts.
 *   Questions — authoring: add / edit / reorder / delete, each with an optional image/GIF.
 *   Results   — the easy "assign answers + update scores" surface: tap the correct answer per
 *               question (or type the number), void anything, then settle winnings. Points +
 *               the leaderboard recompute automatically as answers land.
 * Scope-agnostic (keyed by orgId + contestId), so the same component serves the group and
 * event lanes.
 */
export default function PropsAdmin({
  slug, contestId, apiBase, backHref,
  initialName, initialStatus, initialLocksAt, initialNumericRule, initialEntryCents, initialSplits,
  initialQuestions, participantCount, payouts,
}: {
  slug: string; contestId: string; apiBase: string; backHref: string;
  initialName: string; initialStatus: string; initialLocksAt: string | null; initialNumericRule: NumericRule;
  initialEntryCents: number; initialSplits: PayoutSplit[];
  initialQuestions: PropQuestion[]; participantCount: number; payouts: PropsPayoutsData | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>(initialQuestions.length === 0 ? "questions" : "setup");
  const [questions, setQuestions] = useState<PropQuestion[]>(initialQuestions);
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);
  const [locksLocal, setLocksLocal] = useState(isoToLocal(initialLocksAt));
  const [rule, setRule] = useState<NumericRule>(initialNumericRule);
  const [fee, setFee] = useState(initialEntryCents ? String(initialEntryCents / 100) : "");
  const [splits, setSplits] = useState<PayoutSplit[]>(initialSplits);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const feeCents = Math.round((Number(fee) || 0) * 100);
  const uploadUrl = `${apiBase}/props/upload`;
  const live = questions.filter((q) => !q.voided);
  const settledCount = live.filter(questionSettled).length;

  const reload = useCallback(async () => {
    const res = await fetch(`${apiBase}/props`);
    if (res.ok) setQuestions(((await res.json()).questions ?? []) as PropQuestion[]);
  }, [apiBase]);

  useEffect(() => {
    const unsub = subscribeToProps(contestId, () => { void reload(); router.refresh(); });
    return () => { unsub(); };
  }, [contestId, router, reload]);

  async function saveSettings(patch: Record<string, unknown>) {
    setErr(null);
    const res = await fetch(apiBase, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    setSavedAt(new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }));
    router.refresh();
  }

  const act: Act = async (method, body, qs) => {
    if (busy) return false;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/props${qs ?? ""}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Something went wrong."); setBusy(false); return false; }
      await reload(); router.refresh(); setBusy(false); return true;
    } catch { setErr("Something went wrong."); setBusy(false); return false; }
  };

  async function move(idx: number, dir: -1 | 1) {
    const next = [...questions];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    setQuestions(next);
    await act("PATCH", { action: "reorder", orderedIds: next.map((q) => q.id) });
  }

  const pot = feeCents * participantCount;

  return (
    <div className={styles.page} style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href={backHref} className={styles.back} style={{ margin: 0 }}>← Contests</Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-soft)" }}>
          <ContestTypeIcon kind="props" size={16} /> Props
        </span>
      </div>
      <div className={styles.titleRow}><h1 className={styles.title}>{name || "Props"}</h1></div>

      <div className={styles.segmented} style={{ marginTop: 12 }}>
        <button type="button" className={styles.segmentBtn} data-on={tab === "setup" || undefined} onClick={() => setTab("setup")}>Setup</button>
        <button type="button" className={styles.segmentBtn} data-on={tab === "questions" || undefined} onClick={() => setTab("questions")}>Questions{questions.length ? ` (${questions.length})` : ""}</button>
        <button type="button" className={styles.segmentBtn} data-on={tab === "results" || undefined} onClick={() => setTab("results")}>Results{live.length ? ` (${settledCount}/${live.length})` : ""}</button>
      </div>

      {err && <p className={styles.err} style={{ marginTop: 12 }}>{err}</p>}

      {/* ---- Setup ---- */}
      {tab === "setup" && (
        <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <label><span style={LABEL}>Name</span>
            <input className={styles.input} style={{ width: "100%" }} value={name} maxLength={80}
              onChange={(e) => setName(e.target.value)} onBlur={() => name.trim() && name !== initialName && void saveSettings({ name: name.trim() })} />
          </label>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <label style={{ flex: "1 1 160px" }}><span style={LABEL}>Status</span>
              <select className={styles.selectInput} value={status} onChange={(e) => { setStatus(e.target.value); void saveSettings({ status: e.target.value }); }}>
                <option value="draft">Draft (hidden from members)</option>
                <option value="active">Open (members can answer)</option>
                <option value="final">Final (closed)</option>
              </select>
            </label>
            <label style={{ flex: "1 1 200px" }}><span style={LABEL}>Answers lock at</span>
              <input className={styles.input} style={{ width: "100%" }} type="datetime-local" value={locksLocal}
                onChange={(e) => { setLocksLocal(e.target.value); void saveSettings({ locks_at: localToISO(e.target.value) }); }} />
            </label>
          </div>
          <label><span style={LABEL}>Default numeric scoring</span>
            <select className={styles.selectInput} value={rule} onChange={(e) => { setRule(e.target.value as NumericRule); void saveSettings({ numeric_rule: e.target.value }); }}>
              {NUMERIC_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
            <p className={styles.roundFormHint} style={{ marginTop: 4 }}>{NUMERIC_RULES.find((r) => r.value === rule)?.hint}</p>
          </label>
          <label><span style={LABEL}>Buy-in <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(per player, optional)</span></span>
            <span style={{ position: "relative", display: "block", maxWidth: 160 }}>
              <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)", pointerEvents: "none" }}>$</span>
              <input className={styles.input} style={{ width: "100%", paddingLeft: 26 }} inputMode="decimal" value={fee} placeholder="0"
                onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} onBlur={() => void saveSettings({ entry_cents: feeCents })} />
            </span>
          </label>
          <div>
            <span style={LABEL}>Payouts <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(share of the pot by place)</span></span>
            <PayoutSplitsEditor value={splits} onSave={(s) => { setSplits(s); void saveSettings({ payout_splits: s }); }} />
            {feeCents > 0 && (
              <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
                Pot: {money(feeCents)} × {participantCount} in = <strong style={{ color: "var(--brand)" }}>{money(pot)}</strong>
              </p>
            )}
          </div>
          {savedAt && <p className={styles.roundFormHint} style={{ margin: 0 }}>Saved {savedAt}.</p>}
        </div>
      )}

      {/* ---- Questions (authoring) ---- */}
      {tab === "questions" && (
        <div style={{ marginTop: 14 }}>
          <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Write the props here. Enter the correct answers on the Results tab after the event.</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
            {questions.map((q, i) => (
              <QuestionRow key={q.id} q={q} idx={i} count={questions.length} busy={busy} uploadUrl={uploadUrl} onMove={move} onAct={act} />
            ))}
            {questions.length === 0 && <p className={styles.roundFormHint} style={{ margin: 0 }}>No questions yet. Add the first one below.</p>}
          </div>
          <AddQuestion busy={busy} uploadUrl={uploadUrl} onAdd={(body) => act("POST", body)} />
        </div>
      )}

      {/* ---- Results (settlement + scoring) ---- */}
      {tab === "results" && (
        <div style={{ marginTop: 14 }}>
          {questions.length === 0 ? (
            <p className={styles.roundFormHint} style={{ margin: 0 }}>Add questions on the Questions tab first.</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                <p className={styles.sectionLabel} style={{ margin: 0 }}>Answers &amp; scoring</p>
                <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)", fontWeight: 700 }}>{settledCount}/{live.length} settled</span>
              </div>
              <p className={styles.roundFormHint} style={{ marginTop: 4 }}>Set each correct answer; points and the leaderboard update automatically. Void anything that can&apos;t be settled.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
                {questions.map((q) => <ResultRow key={q.id} q={q} busy={busy} onAct={act} />)}
              </div>
              {payouts && <PropsPayouts apiBase={apiBase} payouts={payouts} />}
            </>
          )}
        </div>
      )}

      <Link href={`/new/${slug}/contests/${contestId}`} target="_blank" className={styles.createBtnGhost} style={{ display: "block", textAlign: "center", marginTop: 24 }}>
        Preview the member view →
      </Link>
    </div>
  );
}

/* ---- one authored question (edit + reorder + delete + media) — no settlement here ---- */
function QuestionRow({
  q, idx, count, busy, uploadUrl, onMove, onAct,
}: {
  q: PropQuestion; idx: number; count: number; busy: boolean; uploadUrl: string;
  onMove: (idx: number, dir: -1 | 1) => void; onAct: Act;
}) {
  const [prompt, setPrompt] = useState(q.prompt);
  const [points, setPoints] = useState(String(q.points));
  const typeLabel = PROP_TYPES.find((t) => t.value === q.qtype)?.label ?? q.qtype;

  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 12, background: "var(--card)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--ink-soft)" }}>{typeLabel}</span>
        {q.voided && <span className={styles.propVoid}>Voided</span>}
        <span style={{ flex: 1 }} />
        <button type="button" aria-label="Move up" disabled={busy || idx === 0} onClick={() => onMove(idx, -1)} className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", opacity: idx === 0 ? 0.3 : 1 }}>↑</button>
        <button type="button" aria-label="Move down" disabled={busy || idx === count - 1} onClick={() => onMove(idx, 1)} className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", opacity: idx === count - 1 ? 0.3 : 1 }}>↓</button>
      </div>

      <input className={styles.input} style={{ width: "100%" }} value={prompt} onChange={(e) => setPrompt(e.target.value)}
        onBlur={() => prompt.trim() && prompt !== q.prompt && void onAct("PATCH", { questionId: q.id, prompt: prompt.trim() })} />

      <div style={{ marginTop: 8 }}>
        <QuestionMediaPicker value={q.imageUrl} uploadUrl={uploadUrl} disabled={busy}
          onChange={(url) => void onAct("PATCH", { questionId: q.id, imageUrl: url })} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", marginTop: 8 }}>
        <label style={{ flex: "0 0 90px" }}><span style={LABEL}>Points</span>
          <input className={styles.input} style={{ width: "100%" }} inputMode="numeric" value={points}
            onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))}
            onBlur={() => { const n = Math.max(1, parseInt(points, 10) || 1); if (n !== q.points) void onAct("PATCH", { questionId: q.id, points: n }); setPoints(String(n)); }} />
        </label>
        {q.qtype === "over_under" && <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>Line: <strong>{q.line}</strong></span>}
        {q.qtype === "multiple_choice" && <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>{q.choices.map((c) => c.label).join(", ")}</span>}
      </div>

      <div style={{ marginTop: 10 }}>
        <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--err, #c0392b)" }} disabled={busy}
          onClick={() => void onAct("DELETE", undefined, `?questionId=${q.id}`)}>Delete</button>
      </div>
    </div>
  );
}

/* ---- one question in the Results view: assign the correct answer + void ---- */
function ResultRow({ q, busy, onAct }: { q: PropQuestion; busy: boolean; onAct: Act }) {
  const isChoice = q.qtype === "multiple_choice" || q.qtype === "yes_no";
  const settled = questionSettled(q);
  const correct = correctChoiceFor(q); // choice id, 'over'/'under', or null
  const [num, setNum] = useState(q.answerNumber != null ? String(q.answerNumber) : "");
  // Re-seed the input when the stored answer changes externally (sync during render, not an effect).
  const [prevAnswer, setPrevAnswer] = useState(q.answerNumber);
  if (prevAnswer !== q.answerNumber) { setPrevAnswer(q.answerNumber); setNum(q.answerNumber != null ? String(q.answerNumber) : ""); }

  return (
    <div style={{ border: `1px solid ${settled ? "var(--brand)" : "var(--line)"}`, borderRadius: 12, padding: 12, background: q.voided ? "color-mix(in srgb, var(--ink) 4%, var(--card))" : "var(--card)" }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <strong style={{ fontSize: "0.92rem" }}>{q.prompt}</strong>
        <span className={styles.propPts} style={{ flexShrink: 0 }}>{q.points} {q.points === 1 ? "pt" : "pts"}</span>
      </div>
      {q.imageUrl && <img src={q.imageUrl} alt="" style={{ display: "block", maxHeight: 90, maxWidth: "100%", objectFit: "contain", borderRadius: 8, margin: "8px 0 0" }} />}

      {q.voided ? (
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>Voided, not scored.</span>
          <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem" }} disabled={busy}
            onClick={() => void onAct("PATCH", { action: "void", questionId: q.id, voided: false })}>Un-void</button>
        </div>
      ) : isChoice ? (
        <div style={{ marginTop: 10 }}>
          <div className={styles.propChoices}>
            {q.choices.map((c) => {
              const on = correct === c.id;
              return (
                <button key={c.id} type="button" className={styles.propChoice} data-win={on || undefined} disabled={busy}
                  onClick={() => void onAct("PATCH", on ? { action: "settle", questionId: q.id, clear: true } : { action: "settle", questionId: q.id, answerText: c.id })}>
                  {c.label}{on ? " ✓" : ""}
                </button>
              );
            })}
          </div>
          <p className={styles.roundFormHint} style={{ margin: "6px 0 0" }}>{settled ? "Tap the highlighted answer to clear it." : "Tap the correct answer."}</p>
        </div>
      ) : (
        <div style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
          <label style={{ flex: "1 1 160px" }}><span style={LABEL}>{q.qtype === "over_under" ? `Actual value (line ${q.line})` : "Correct number"}</span>
            <input className={styles.input} style={{ width: "100%" }} inputMode="numeric" value={num} placeholder={q.format === "duration" ? "seconds" : "number"}
              onChange={(e) => setNum(e.target.value.replace(/[^0-9.-]/g, ""))} />
          </label>
          <button type="button" className={styles.createBtn} style={{ width: "auto", padding: "10px 14px" }} disabled={busy || num === ""}
            onClick={() => void onAct("PATCH", { action: "settle", questionId: q.id, answerNumber: Number(num) })}>{settled ? "Update" : "Save"}</button>
          {settled && (
            <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem" }} disabled={busy}
              onClick={() => void onAct("PATCH", { action: "settle", questionId: q.id, clear: true })}>Clear</button>
          )}
          {settled && q.qtype === "over_under" && (
            <span style={{ fontSize: "0.82rem", color: "var(--brand)", fontWeight: 700, width: "100%" }}>Winner: {correct === "over" ? "Over" : correct === "under" ? "Under" : "Push"}</span>
          )}
        </div>
      )}

      {!q.voided && (
        <div style={{ marginTop: 10 }}>
          <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.78rem", color: "var(--ink-soft)" }} disabled={busy}
            onClick={() => void onAct("PATCH", { action: "void", questionId: q.id, voided: true })}>Void this question</button>
        </div>
      )}
    </div>
  );
}

/* ---- add a question ---- */
function AddQuestion({ busy, uploadUrl, onAdd }: { busy: boolean; uploadUrl: string; onAdd: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [qtype, setQtype] = useState<PropType>("multiple_choice");
  const [prompt, setPrompt] = useState("");
  const [choices, setChoices] = useState<string[]>(["", ""]);
  const [line, setLine] = useState("");
  const [points, setPoints] = useState("1");
  const [format, setFormat] = useState<"number" | "duration">("number");
  const [rule, setRule] = useState<"" | NumericRule>("");
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  function reset() { setPrompt(""); setChoices(["", ""]); setLine(""); setPoints("1"); setFormat("number"); setRule(""); setQtype("multiple_choice"); setImageUrl(null); }

  async function submit() {
    const body: Record<string, unknown> = {
      prompt: prompt.trim(), qtype, points: Math.max(1, parseInt(points, 10) || 1),
      numericRule: rule || null, imageUrl,
    };
    if (qtype === "multiple_choice") body.choices = choices.map((c) => c.trim()).filter(Boolean);
    if (qtype === "over_under") body.line = Number(line);
    if (qtype === "numeric") body.format = format;
    if (await onAdd(body)) { reset(); setOpen(false); }
  }

  if (!open) return <button type="button" className={styles.createBtnGhost} style={{ marginTop: 12 }} onClick={() => setOpen(true)}>+ Add question</button>;

  return (
    <div style={{ marginTop: 12, border: "1px solid var(--line)", borderRadius: 12, padding: 12, display: "flex", flexDirection: "column", gap: 10 }}>
      <label><span style={LABEL}>Type</span>
        <select className={styles.selectInput} value={qtype} onChange={(e) => setQtype(e.target.value as PropType)}>
          {PROP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label><span style={LABEL}>Question</span>
        <input className={styles.input} style={{ width: "100%" }} value={prompt} autoFocus placeholder="e.g. How long is the national anthem (seconds)?" onChange={(e) => setPrompt(e.target.value)} />
      </label>

      {qtype === "multiple_choice" && (
        <div>
          <span style={LABEL}>Choices</span>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {choices.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6 }}>
                <input className={styles.input} style={{ flex: 1 }} value={c} placeholder={`Choice ${i + 1}`} onChange={(e) => setChoices((cs) => cs.map((x, j) => (j === i ? e.target.value : x)))} />
                {choices.length > 2 && <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer" }} onClick={() => setChoices((cs) => cs.filter((_, j) => j !== i))}>✕</button>}
              </div>
            ))}
          </div>
          <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", marginTop: 6 }} onClick={() => setChoices((cs) => [...cs, ""])}>+ Add choice</button>
        </div>
      )}
      {qtype === "over_under" && (
        <label><span style={LABEL}>Over / under line</span>
          <input className={styles.input} style={{ width: 140 }} inputMode="decimal" value={line} placeholder="e.g. 48.5" onChange={(e) => setLine(e.target.value.replace(/[^0-9.]/g, ""))} />
        </label>
      )}
      {qtype === "numeric" && (
        <>
          <label><span style={LABEL}>Answer format</span>
            <select className={styles.selectInput} value={format} onChange={(e) => setFormat(e.target.value as "number" | "duration")}>
              <option value="number">Plain number</option>
              <option value="duration">Duration (mm:ss, entered as seconds)</option>
            </select>
          </label>
          <label><span style={LABEL}>Scoring override <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
            <select className={styles.selectInput} value={rule} onChange={(e) => setRule(e.target.value as NumericRule | "")}>
              <option value="">Use the set default</option>
              {NUMERIC_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </label>
        </>
      )}
      <label style={{ maxWidth: 120 }}><span style={LABEL}>Points</span>
        <input className={styles.input} style={{ width: "100%" }} inputMode="numeric" value={points} onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))} />
      </label>

      <QuestionMediaPicker value={imageUrl} uploadUrl={uploadUrl} disabled={busy} onChange={setImageUrl} />

      <div style={{ display: "flex", gap: 10 }}>
        <button type="button" className={styles.createBtn} style={{ width: "auto", padding: "10px 16px" }} disabled={busy || !prompt.trim() || (qtype === "multiple_choice" && choices.filter((c) => c.trim()).length < 2) || (qtype === "over_under" && line === "")} onClick={() => void submit()}>Add question</button>
        <button type="button" className={styles.createBtnGhost} style={{ width: "auto", padding: "10px 16px" }} onClick={() => { reset(); setOpen(false); }}>Cancel</button>
      </div>
    </div>
  );
}

/* ---- optional image / GIF for a question (GIPHY search + upload) ---- */
function QuestionMediaPicker({ value, uploadUrl, onChange, disabled }: {
  value: string | null; uploadUrl: string; onChange: (url: string | null) => void; disabled?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [gifOpen, setGifOpen] = useState(false);
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<{ id: string; url: string }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const giphyKey = process.env.NEXT_PUBLIC_GIPHY_API_KEY;

  useEffect(() => {
    if (!gifOpen || !giphyKey) return;
    const t = setTimeout(async () => {
      const query = q.trim();
      const url = query
        ? `https://api.giphy.com/v1/gifs/search?api_key=${giphyKey}&q=${encodeURIComponent(query)}&limit=24&rating=pg-13`
        : `https://api.giphy.com/v1/gifs/trending?api_key=${giphyKey}&limit=24&rating=pg-13`;
      try {
        const r = await fetch(url);
        const d = await r.json();
        type G = { id: string; images: { fixed_width: { url: string } } };
        setGifs((d.data || []).map((g: G) => ({ id: g.id, url: g.images.fixed_width.url })));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(t);
  }, [gifOpen, q, giphyKey]);

  async function upload(file: File) {
    setUploading(true); setErr(null);
    try {
      const fd = new FormData(); fd.append("file", file);
      const r = await fetch(uploadUrl, { method: "POST", body: fd });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) { setErr(d.error || "Upload failed"); return; }
      onChange(d.image_url as string);
    } catch { setErr("Upload failed"); } finally { setUploading(false); }
  }

  return (
    <div>
      <span style={LABEL}>Image / GIF <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
      {value ? (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <img src={value} alt="" className={styles.propImageThumb} />
          <div style={{ display: "flex", gap: 14 }}>
            <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem" }} disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>Replace</button>
            <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", color: "var(--err, #c0392b)" }} disabled={disabled} onClick={() => onChange(null)}>Remove</button>
          </div>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {giphyKey && <button type="button" className={styles.createBtnGhost} style={{ width: "auto", padding: "7px 12px", fontSize: "0.82rem" }} disabled={disabled} onClick={() => setGifOpen((o) => !o)}>{gifOpen ? "Close GIFs" : "Search GIFs"}</button>}
          <button type="button" className={styles.createBtnGhost} style={{ width: "auto", padding: "7px 12px", fontSize: "0.82rem" }} disabled={disabled || uploading} onClick={() => fileRef.current?.click()}>{uploading ? "Uploading…" : "Upload image"}</button>
        </div>
      )}
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); e.target.value = ""; }} />
      {err && <p className={styles.err} style={{ margin: "6px 0 0" }}>{err}</p>}
      {gifOpen && !value && (
        <div style={{ marginTop: 8, border: "1px solid var(--line)", borderRadius: 10, padding: 8 }}>
          <input className={styles.input} style={{ width: "100%", marginBottom: 8 }} placeholder="Search GIFs" value={q} onChange={(e) => setQ(e.target.value)} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, maxHeight: 220, overflowY: "auto" }}>
            {gifs.map((g) => (
              <button key={g.id} type="button" onClick={() => { onChange(g.url); setGifOpen(false); setQ(""); }}
                style={{ border: "none", padding: 0, background: "none", cursor: "pointer", borderRadius: 8, overflow: "hidden", aspectRatio: "1 / 1" }}>
                <img src={g.url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} loading="lazy" />
              </button>
            ))}
            {gifs.length === 0 && <p className={styles.roundFormHint} style={{ gridColumn: "1 / -1", margin: 0 }}>Search for a GIF…</p>}
          </div>
          <p className={styles.roundFormHint} style={{ margin: "6px 0 0", textAlign: "center", fontSize: "0.68rem" }}>Powered by GIPHY</p>
        </div>
      )}
    </div>
  );
}
