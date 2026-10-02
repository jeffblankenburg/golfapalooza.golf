"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import styles from "@/app/new/new.module.css";

// Event-wide (cross-day) competitions — aren't born from a schedule slot.
const KINDS = [
  { key: "bspitw", label: "BSPITW", blurb: "Best scramble partner, all days" },
  { key: "hundred_feet", label: "100 Feet!", blurb: "Cumulative distance, hole 18" },
  { key: "other", label: "Other", blurb: "A custom event-wide contest" },
];

export default function AddCompetition({ orgId, eventId }: { orgId: string; eventId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState("bspitw");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_type: kind, name: name.trim() || undefined }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not add");
      return;
    }
    setOpen(false);
    setName("");
    setKind("bspitw");
    router.refresh();
  }

  return (
    <>
      <button type="button" className={styles.circleAdd} aria-label="Add competition" onClick={() => setOpen(true)}>
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Modal open={open} title="Add competition" onClose={() => setOpen(false)}>
        <form className={styles.form} onSubmit={create}>
          <div className={styles.field}>
            <label className={styles.label}>Type</label>
            <div className={styles.pillRow} role="group" aria-label="Competition type">
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={styles.pill} data-on={kind === k.key || undefined} onClick={() => setKind(k.key)}>
                  {k.label}
                </button>
              ))}
            </div>
            <p className={styles.contestKindBlurb}>{KINDS.find((k) => k.key === kind)?.blurb}</p>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Name <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Defaults to the type name" maxLength={80} />
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Adding…" : "Add competition"}
          </button>
        </form>
      </Modal>
    </>
  );
}
