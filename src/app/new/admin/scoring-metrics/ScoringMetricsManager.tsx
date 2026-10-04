"use client";

import { useState } from "react";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import styles from "@/app/new/new.module.css";
import type { ScoringMetric, MetricValueType } from "@/lib/v2/scoring-metrics";

const VALUE_TYPES: { value: MetricValueType; label: string; hint: string }[] = [
  { value: "flag", label: "Yes / no", hint: "A per-player toggle (on the green? holed out?)" },
  { value: "distance", label: "Distance", hint: "A measured distance from the hole (inches)" },
  { value: "count", label: "Count", hint: "A whole-number tally for the hole" },
];
const typeLabel = (t: string) => VALUE_TYPES.find((v) => v.value === t)?.label || t;

/**
 * System-admin editor for the platform scoring-metric catalog (#220). Add, edit the
 * label/description/type, deactivate, or delete (delete refused while in use —
 * deactivate instead). Group admins pick from this list on a consuming contest.
 */
export default function ScoringMetricsManager({ initialMetrics }: { initialMetrics: ScoringMetric[] }) {
  const base = "/api/v2/admin/scoring-metrics";
  const [metrics, setMetrics] = useState<ScoringMetric[]>(initialMetrics);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ScoringMetric | null>(null);
  const [label, setLabel] = useState("");
  const [description, setDescription] = useState("");
  const [valueType, setValueType] = useState<MetricValueType>("flag");
  const [confirmDel, setConfirmDel] = useState<ScoringMetric | null>(null);

  function openCreate() { setEditing(null); setLabel(""); setDescription(""); setValueType("flag"); setError(null); setFormOpen(true); }
  function openEdit(m: ScoringMetric) { setEditing(m); setLabel(m.label); setDescription(m.description || ""); setValueType(m.value_type); setError(null); setFormOpen(true); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!label.trim()) { setError("Label is required"); return; }
    setBusy(true); setError(null);
    const payload = { label: label.trim(), description: description.trim(), value_type: valueType };
    try {
      if (editing) {
        const res = await fetch(`${base}/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
        const { metric } = await res.json();
        setMetrics((prev) => prev.map((m) => (m.id === editing.id ? metric : m)));
      } else {
        const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not create"); return; }
        const { metric } = await res.json();
        setMetrics((prev) => [...prev, metric]);
      }
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(m: ScoringMetric) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/${m.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !m.is_active }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not update"); return; }
      const { metric } = await res.json();
      setMetrics((prev) => prev.map((x) => (x.id === m.id ? metric : x)));
    } finally {
      setBusy(false);
    }
  }

  async function remove(m: ScoringMetric) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/${m.id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not delete"); setConfirmDel(null); return; }
      setMetrics((prev) => prev.filter((x) => x.id !== m.id));
      setConfirmDel(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p className={styles.formError} style={{ marginTop: 12 }}>{error}</p>}

      <div className={styles.titleRow} style={{ marginTop: 18 }}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Metrics ({metrics.length})</p>
        <button type="button" className={styles.circleAdd} aria-label="Add metric" onClick={openCreate}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <div className={styles.memberList} style={{ marginTop: 10 }}>
        {metrics.map((m) => (
          <div key={m.id} className={styles.memberRow} style={{ opacity: m.is_active ? 1 : 0.55, alignItems: "flex-start" }}>
            <div className={styles.memberMeta} style={{ minWidth: 0 }}>
              <div className={styles.memberName}>
                {m.label}
                <span className={styles.roleBadge} style={{ marginLeft: 8 }}>{typeLabel(m.value_type)}</span>
                {!m.is_active && <span className={styles.roleBadge} style={{ marginLeft: 6 }}>inactive</span>}
              </div>
              {m.description && <div className={styles.memberSub} style={{ whiteSpace: "normal" }}>{m.description}</div>}
              <div className={styles.memberSub}>{m.key}</div>
            </div>
            <button type="button" className={styles.createBtnGhost} onClick={() => toggleActive(m)} disabled={busy}>
              {m.is_active ? "Deactivate" : "Activate"}
            </button>
            <button type="button" className={styles.sideEditBtn} aria-label="Edit metric" onClick={() => openEdit(m)} style={{ marginLeft: 6 }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
            </button>
          </div>
        ))}
      </div>

      <Modal open={formOpen} title={editing ? "Edit metric" : "Add metric"} onClose={() => (busy ? undefined : setFormOpen(false))}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label className={styles.label}>Label</label>
            <input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Greens hit" maxLength={60} autoFocus />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Type</label>
            <select className={styles.selectInput} value={valueType} onChange={(e) => setValueType(e.target.value as MetricValueType)}>
              {VALUE_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
            <p className={styles.roundFormHint}>{VALUE_TYPES.find((v) => v.value === valueType)?.hint}</p>
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Description <span className={styles.optional}>(shown to group admins)</span></label>
            <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What this metric measures and when to use it" maxLength={500} rows={3} />
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : editing ? "Save metric" : "Add metric"}
            </button>
            {editing && (
              <button type="button" className={styles.deleteBtn} onClick={() => { const m = editing; setFormOpen(false); setConfirmDel(m); }} disabled={busy}>
                Delete metric
              </button>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        destructive
        title="Delete metric?"
        message={confirmDel ? `Remove "${confirmDel.label}"? If any contest has collected it, deactivate it instead.` : ""}
        confirmLabel="Delete"
        onConfirm={() => confirmDel && remove(confirmDel)}
        onCancel={() => (busy ? undefined : setConfirmDel(null))}
      />
    </div>
  );
}
