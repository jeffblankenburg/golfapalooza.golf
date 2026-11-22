"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "@/app/new/new.module.css";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { ContestTypeIcon } from "@/app/new/_components/contest-card/ContestCard";
import { subscribeToProps } from "@/lib/v2/realtime/props-channel";
import { PROP_TYPES, NUMERIC_RULES, correctChoiceFor, questionSettled, type PropQuestion, type PropChoice, type PropType, type NumericRule } from "@/lib/v2/contests/props";
import PropsPayouts from "./PropsPayouts";
import type { PropsPayouts as PropsPayoutsData } from "@/lib/v2/contests/props-server";
/* eslint-disable @next/next/no-img-element */

const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

type Tab = "questions" | "results";
type ActResult = { ok: boolean; error?: string };
type Act = (method: "POST" | "PATCH" | "DELETE", body?: Record<string, unknown>, qs?: string) => Promise<ActResult>;

/**
 * Props admin detail — two focused views behind a segmented control:
 *   Questions — authoring: add / edit / reorder / delete, each with an optional image/GIF.
 *   Results   — the easy "assign answers + update scores" surface: tap the correct answer per
 *               question (or type the number), void anything, then settle winnings. Points +
 *               the leaderboard recompute automatically as answers land.
 * Contest-level settings (name, status, lock, scoring, buy-in, payouts) live in the gear
 * on the contest CARD (PropsSettings), not here. Scope-agnostic (keyed by orgId + contestId),
 * so the same component serves the group and event lanes.
 */
export default function PropsAdmin({
  slug, contestId, apiBase, backHref, initialName, initialQuestions, payouts,
}: {
  slug: string; contestId: string; apiBase: string; backHref: string;
  initialName: string; initialQuestions: PropQuestion[]; payouts: PropsPayoutsData | null;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("questions");
  const [questions, setQuestions] = useState<PropQuestion[]>(initialQuestions);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  const act: Act = async (method, body, qs) => {
    if (busy) return { ok: false };
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/props${qs ?? ""}`, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
      if (!res.ok) { const error = (await res.json().catch(() => ({}))).error || "Something went wrong."; setErr(error); setBusy(false); return { ok: false, error }; }
      await reload(); router.refresh(); setBusy(false); return { ok: true };
    } catch { setErr("Something went wrong."); setBusy(false); return { ok: false, error: "Something went wrong." }; }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  async function reorder(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = questions.findIndex((q) => q.id === active.id);
    const newIdx = questions.findIndex((q) => q.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const before = questions;
    const next = arrayMove(questions, oldIdx, newIdx);
    setQuestions(next); // optimistic
    if (!(await act("PATCH", { action: "reorder", orderedIds: next.map((q) => q.id) })).ok) setQuestions(before);
  }

  return (
    <div className={styles.page} style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href={backHref} className={styles.back} style={{ margin: 0 }}>← Contests</Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-soft)" }}>
          <ContestTypeIcon kind="props" size={16} /> Props
        </span>
      </div>
      <div className={styles.titleRow}><h1 className={styles.title}>{initialName || "Props"}</h1></div>

      <div className={styles.segmented} style={{ marginTop: 12 }}>
        <button type="button" className={styles.segmentBtn} data-on={tab === "questions" || undefined} onClick={() => setTab("questions")}>Questions{questions.length ? ` (${questions.length})` : ""}</button>
        <button type="button" className={styles.segmentBtn} data-on={tab === "results" || undefined} onClick={() => setTab("results")}>Results{live.length ? ` (${settledCount}/${live.length})` : ""}</button>
      </div>

      {err && <p className={styles.err} style={{ marginTop: 12 }}>{err}</p>}

      {/* ---- Questions (authoring) ---- */}
      {tab === "questions" && (
        <div style={{ marginTop: 14 }}>
          <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Write the props here. Enter the correct answers on the Results tab after the event.</p>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => void reorder(e)}>
            <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                {questions.map((q, i) => (
                  <QuestionRow key={q.id} q={q} idx={i} busy={busy} uploadUrl={uploadUrl} onAct={act} />
                ))}
                {questions.length === 0 && <p className={styles.roundFormHint} style={{ margin: 0 }}>No questions yet. Add the first one below.</p>}
              </div>
            </SortableContext>
          </DndContext>
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

/* Question field: a textarea that grows to fit its content so a long, wrapping question is fully visible. */
function QuestionTextarea({ value, onChange, onBlur, autoFocus, placeholder }: {
  value: string; onChange: (v: string) => void; onBlur?: () => void; autoFocus?: boolean; placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = (el: HTMLTextAreaElement | null) => { if (el) { el.style.height = "auto"; el.style.height = `${el.scrollHeight}px`; } };
  useEffect(() => { fit(ref.current); }, [value]);
  return (
    <textarea ref={ref} className={styles.textarea} style={{ resize: "none", overflow: "hidden" }} rows={2}
      value={value} autoFocus={autoFocus} placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)} onBlur={onBlur} />
  );
}

/* A choice while editing: the server choice plus a stable client key (new rows have no id yet, so key drives React + drag). */
type EditChoice = PropChoice & { key: string };
const seedChoices = (cs: PropChoice[]): EditChoice[] => cs.map((c, i) => ({ ...c, key: c.id || `seed-${i}` }));

/* ---- one draggable choice inside the edit modal ---- */
function ChoiceRow({ choice, index, canRemove, busy, onLabel, onBlur, onRemove }: {
  choice: EditChoice; index: number; canRemove: boolean; busy: boolean;
  onLabel: (v: string) => void; onBlur: () => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: choice.key });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={{ ...style, display: "flex", gap: 6, alignItems: "center" }}>
      <button type="button" className={styles.finGrab} aria-label="Drag to reorder" {...listeners} {...attributes}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" />
          <circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" />
          <circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
        </svg>
      </button>
      <input className={styles.input} style={{ flex: 1 }} value={choice.label} placeholder={`Choice ${index + 1}`}
        onChange={(e) => onLabel(e.target.value)} onBlur={onBlur} />
      {canRemove && <button type="button" aria-label="Remove choice" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer" }} disabled={busy} onClick={onRemove}>✕</button>}
    </div>
  );
}

/* ---- one authored question: a compact row (drag handle + number + text); everything else lives in the edit modal ---- */
function QuestionRow({
  q, idx, busy, uploadUrl, onAct,
}: {
  q: PropQuestion; idx: number; busy: boolean; uploadUrl: string; onAct: Act;
}) {
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [prompt, setPrompt] = useState(q.prompt);
  const [points, setPoints] = useState(String(q.points));
  const [choices, setChoices] = useState<EditChoice[]>(() => seedChoices(q.choices));
  const [line, setLine] = useState(q.line != null ? String(q.line) : "");
  const [rowErr, setRowErr] = useState<string | null>(null);
  const newKey = useRef(0);
  const typeLabel = PROP_TYPES.find((t) => t.value === q.qtype)?.label ?? q.qtype;

  // Re-seed the local editors when the stored question changes externally (sync during render, not an effect).
  const [prevQ, setPrevQ] = useState(q);
  if (prevQ !== q) { setPrevQ(q); setChoices(seedChoices(q.choices)); setLine(q.line != null ? String(q.line) : ""); if (prompt === prevQ.prompt) setPrompt(q.prompt); if (points === String(prevQ.points)) setPoints(String(q.points)); }

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: q.id });
  const sortStyle = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  const choiceSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  async function save(patch: Record<string, unknown>) {
    const r = await onAct("PATCH", { questionId: q.id, ...patch });
    setRowErr(r.ok ? null : (r.error ?? "Could not save."));
  }
  async function saveChoices(next: EditChoice[]): Promise<boolean> {
    if (next.map((c) => c.label.trim()).filter(Boolean).length < 2) { setRowErr("Give at least two choices."); return false; }
    setRowErr(null);
    const r = await onAct("PATCH", { questionId: q.id, choices: next.map((c) => ({ id: c.id || undefined, label: c.label.trim() })) });
    setRowErr(r.ok ? null : (r.error ?? "Could not save."));
    return r.ok;
  }
  async function reorderChoices(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = choices.findIndex((c) => c.key === active.id);
    const newIdx = choices.findIndex((c) => c.key === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const before = choices;
    const next = arrayMove(choices, oldIdx, newIdx);
    setChoices(next); // optimistic
    if (!(await saveChoices(next))) setChoices(before);
  }

  return (
    <>
      {/* compact list row */}
      <div ref={setNodeRef} style={{ ...sortStyle, display: "flex", alignItems: "center", gap: 8, border: "1px solid var(--line)", borderRadius: 12, padding: "8px 10px", background: "var(--card)" }}>
        <button type="button" className={styles.finGrab} aria-label="Drag to reorder" {...listeners} {...attributes}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" />
            <circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" />
            <circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
          </svg>
        </button>
        <span style={{ flexShrink: 0, width: 24, height: 24, borderRadius: 999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: "0.78rem", fontWeight: 800, color: "var(--ink-soft)", background: "color-mix(in srgb, var(--ink) 6%, var(--card))" }}>{idx + 1}</span>
        <button type="button" onClick={() => setEditOpen(true)} style={{ flex: 1, minWidth: 0, textAlign: "left", background: "none", border: "none", cursor: "pointer", padding: 0, font: "inherit", fontSize: "0.9rem", color: "var(--ink)" }}>
          {q.prompt || <span style={{ color: "var(--ink-soft)", fontStyle: "italic" }}>Untitled question</span>}
          {q.voided && <span className={styles.propVoid} style={{ marginLeft: 8, verticalAlign: "middle" }}>Voided</span>}
        </button>
      </div>

      {/* edit modal — type / prompt / media / points, plus delete */}
      <Modal open={editOpen} title={`Question ${idx + 1}`} onClose={() => setEditOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: "0.68rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--ink-soft)" }}>{typeLabel}</span>
            {q.voided && <span className={styles.propVoid}>Voided</span>}
          </div>

          <label><span style={LABEL}>Question</span>
            <QuestionTextarea value={prompt} onChange={setPrompt}
              onBlur={() => prompt.trim() && prompt !== q.prompt && void save({ prompt: prompt.trim() })} />
          </label>

          {q.qtype === "multiple_choice" && (
            <div>
              <span style={LABEL}>Choices</span>
              <DndContext sensors={choiceSensors} collisionDetection={closestCenter} onDragEnd={(e) => void reorderChoices(e)}>
                <SortableContext items={choices.map((c) => c.key)} strategy={verticalListSortingStrategy}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {choices.map((c, i) => (
                      <ChoiceRow key={c.key} choice={c} index={i} canRemove={choices.length > 2} busy={busy}
                        onLabel={(v) => setChoices((cs) => cs.map((x, j) => (j === i ? { ...x, label: v } : x)))}
                        onBlur={() => void saveChoices(choices)}
                        onRemove={() => { const next = choices.filter((_, j) => j !== i); setChoices(next); void saveChoices(next); }} />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
              <button type="button" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.8rem", marginTop: 6 }} onClick={() => setChoices((cs) => [...cs, { id: "", label: "", key: `new-${newKey.current++}` }])}>+ Add choice</button>
            </div>
          )}
          {q.qtype === "over_under" && (
            <label><span style={LABEL}>Over / under line</span>
              <input className={styles.input} style={{ width: 140 }} inputMode="decimal" value={line} placeholder="e.g. 48.5"
                onChange={(e) => setLine(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => { if (line === "") { setRowErr("Set the over/under line."); return; } if (Number(line) !== q.line) void save({ line: Number(line) }); }} />
            </label>
          )}
          {q.qtype === "numeric" && (
            <>
              <label><span style={LABEL}>Answer format</span>
                <select className={styles.selectInput} value={q.format ?? "number"} onChange={(e) => void save({ format: e.target.value })}>
                  <option value="number">Plain number</option>
                  <option value="duration">Duration (mm:ss, entered as seconds)</option>
                </select>
              </label>
              <label><span style={LABEL}>Scoring override <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
                <select className={styles.selectInput} value={q.numericRule ?? ""} onChange={(e) => void save({ numericRule: e.target.value || null })}>
                  <option value="">Use the set default</option>
                  {NUMERIC_RULES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </label>
            </>
          )}
          {q.qtype === "yes_no" && <p className={styles.roundFormHint} style={{ margin: 0 }}>Answers are fixed to Yes / No.</p>}

          <QuestionMediaPicker value={q.imageUrl} uploadUrl={uploadUrl} disabled={busy}
            onChange={(url) => void save({ imageUrl: url })} />

          <label style={{ maxWidth: 120 }}><span style={LABEL}>Points</span>
            <input className={styles.input} style={{ width: "100%" }} inputMode="numeric" value={points}
              onChange={(e) => setPoints(e.target.value.replace(/\D/g, ""))}
              onBlur={() => { const n = Math.max(1, parseInt(points, 10) || 1); if (n !== q.points) void save({ points: n }); setPoints(String(n)); }} />
          </label>

          {rowErr && <p className={styles.err} style={{ margin: 0 }}>{rowErr}</p>}

          <div style={{ marginTop: 2, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
            <button type="button" className={styles.deleteBtn} disabled={busy} onClick={() => setConfirmDel(true)}
              style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 7 }}>
              <TrashIcon /> Delete question
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmDel}
        title="Delete question?"
        message={q.prompt ? `Delete "${q.prompt}"? This can't be undone.` : "Delete this question? This can't be undone."}
        confirmLabel="Delete"
        destructive
        onConfirm={() => { setConfirmDel(false); setEditOpen(false); void onAct("DELETE", undefined, `?questionId=${q.id}`); }}
        onCancel={() => setConfirmDel(false)}
      />
    </>
  );
}

function TrashIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <line x1="10" y1="11" x2="10" y2="17" />
      <line x1="14" y1="11" x2="14" y2="17" />
    </svg>
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
function AddQuestion({ busy, uploadUrl, onAdd }: { busy: boolean; uploadUrl: string; onAdd: (body: Record<string, unknown>) => Promise<ActResult> }) {
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

  function close() { reset(); setOpen(false); }

  async function submit() {
    const body: Record<string, unknown> = {
      prompt: prompt.trim(), qtype, points: Math.max(1, parseInt(points, 10) || 1),
      numericRule: rule || null, imageUrl,
    };
    if (qtype === "multiple_choice") body.choices = choices.map((c) => c.trim()).filter(Boolean);
    if (qtype === "over_under") body.line = Number(line);
    if (qtype === "numeric") body.format = format;
    if ((await onAdd(body)).ok) close();
  }

  return (
    <>
      <button type="button" className={styles.createBtnGhost} style={{ marginTop: 12 }} onClick={() => setOpen(true)}>+ Add question</button>
      <Modal open={open} title="Add question" onClose={close}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label><span style={LABEL}>Type</span>
        <select className={styles.selectInput} value={qtype} onChange={(e) => setQtype(e.target.value as PropType)}>
          {PROP_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </label>
      <label><span style={LABEL}>Question</span>
        <QuestionTextarea value={prompt} autoFocus placeholder="e.g. How long is the national anthem (seconds)?" onChange={setPrompt} />
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

      <div style={{ display: "flex", gap: 10, marginTop: 6, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <button type="button" className={styles.createBtn} style={{ flex: 1 }} disabled={busy || !prompt.trim() || (qtype === "multiple_choice" && choices.filter((c) => c.trim()).length < 2) || (qtype === "over_under" && line === "")} onClick={() => void submit()}>Add question</button>
        <button type="button" className={styles.createBtnGhost} style={{ width: "auto", padding: "10px 16px" }} onClick={close}>Cancel</button>
      </div>
        </div>
      </Modal>
    </>
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
