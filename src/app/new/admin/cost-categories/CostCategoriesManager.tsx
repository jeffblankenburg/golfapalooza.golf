"use client";

import { useState } from "react";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import styles from "@/app/new/new.module.css";
import type { CostCategory } from "@/lib/v2/cost-categories";

/**
 * System-admin editor for the platform cost-category list. Add, rename, re-icon,
 * deactivate, or delete (delete refused while a category is in use — deactivate).
 */
export default function CostCategoriesManager({ initialCategories }: { initialCategories: CostCategory[] }) {
  const base = "/api/v2/admin/cost-categories";
  const [cats, setCats] = useState<CostCategory[]>(initialCategories);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CostCategory | null>(null);
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [confirmDel, setConfirmDel] = useState<CostCategory | null>(null);

  function openCreate() { setEditing(null); setLabel(""); setIcon(""); setError(null); setFormOpen(true); }
  function openEdit(c: CostCategory) { setEditing(c); setLabel(c.label); setIcon(c.icon || ""); setError(null); setFormOpen(true); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!label.trim()) { setError("Label is required"); return; }
    setBusy(true); setError(null);
    try {
      if (editing) {
        const res = await fetch(`${base}/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), icon }) });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
        const { category } = await res.json();
        setCats((prev) => prev.map((c) => (c.id === editing.id ? category : c)));
      } else {
        const res = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: label.trim(), icon }) });
        if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not create"); return; }
        const { category } = await res.json();
        setCats((prev) => [...prev, category]);
      }
      setFormOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(c: CostCategory) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ is_active: !c.is_active }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not update"); return; }
      const { category } = await res.json();
      setCats((prev) => prev.map((x) => (x.id === c.id ? category : x)));
    } finally {
      setBusy(false);
    }
  }

  async function remove(c: CostCategory) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/${c.id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not delete"); setConfirmDel(null); return; }
      setCats((prev) => prev.filter((x) => x.id !== c.id));
      setConfirmDel(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {error && <p className={styles.formError} style={{ marginTop: 12 }}>{error}</p>}

      <div className={styles.titleRow} style={{ marginTop: 18 }}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Categories ({cats.length})</p>
        <button type="button" className={styles.circleAdd} aria-label="Add category" onClick={openCreate}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      <div className={styles.memberList} style={{ marginTop: 10 }}>
        {cats.map((c) => (
          <div key={c.id} className={styles.memberRow} style={{ opacity: c.is_active ? 1 : 0.55 }}>
            <span className={styles.memberAvatar} aria-hidden style={{ background: "transparent", fontSize: "1.1rem" }}>{c.icon || "🏷️"}</span>
            <div className={styles.memberMeta} style={{ minWidth: 0 }}>
              <div className={styles.memberName}>{c.label}{!c.is_active && <span className={styles.roleBadge} style={{ marginLeft: 8 }}>inactive</span>}</div>
              <div className={styles.memberSub}>{c.key}</div>
            </div>
            <button type="button" className={styles.createBtnGhost} onClick={() => toggleActive(c)} disabled={busy}>
              {c.is_active ? "Deactivate" : "Activate"}
            </button>
            <button type="button" className={styles.sideEditBtn} aria-label="Edit category" onClick={() => openEdit(c)} style={{ marginLeft: 6 }}>
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
            </button>
          </div>
        ))}
      </div>

      <Modal open={formOpen} title={editing ? "Edit category" : "Add category"} onClose={() => (busy ? undefined : setFormOpen(false))}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.profileTwoCol}>
            <div className={styles.field} style={{ flex: "none", width: 90 }}>
              <label className={styles.label}>Icon</label>
              <input className={styles.input} value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="🏷️" maxLength={4} style={{ textAlign: "center" }} />
            </div>
            <div className={styles.field} style={{ flex: 1 }}>
              <label className={styles.label}>Label</label>
              <input className={styles.input} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Transportation" maxLength={60} autoFocus />
            </div>
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : editing ? "Save category" : "Add category"}
            </button>
            {editing && (
              <button type="button" className={styles.deleteBtn} onClick={() => { const c = editing; setFormOpen(false); setConfirmDel(c); }} disabled={busy}>
                Delete category
              </button>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        destructive
        title="Delete category?"
        message={confirmDel ? `Remove "${confirmDel.label}"? If any cost item uses it, deactivate it instead.` : ""}
        confirmLabel="Delete"
        onConfirm={() => confirmDel && remove(confirmDel)}
        onCancel={() => (busy ? undefined : setConfirmDel(null))}
      />
    </div>
  );
}
