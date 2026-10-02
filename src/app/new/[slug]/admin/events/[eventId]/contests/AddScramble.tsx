"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import styles from "@/app/new/new.module.css";

/**
 * Create a scramble from the Contests hub. Date drives its calendar entry; teams
 * and tee times are set on the scramble itself afterward. Owner/admin.
 */
export default function AddScramble({
  orgId,
  eventId,
  startDate,
  endDate,
}: {
  orgId: string;
  eventId: string;
  startDate: string | null;
  endDate: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [day, setDay] = useState(startDate || "");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function openNew() {
    setName("");
    setDay(startDate || "");
    setTime("");
    setError(null);
    setOpen(true);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      setError("Pick a valid date");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_type: "scramble",
        name: name.trim() || undefined,
        contest_date: day || null,
        start_time: time || null,
      }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not create");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={styles.circleAdd} aria-label="Add scramble" onClick={openNew}>
        <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
        </svg>
      </button>

      <Modal open={open} title="New scramble" onClose={() => setOpen(false)}>
        <form className={styles.form} onSubmit={create}>
          <div className={styles.field}>
            <label className={styles.label}>Name <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Friday Scramble" maxLength={80} autoFocus />
          </div>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input
                className={styles.input}
                type="date"
                value={day}
                min={startDate || undefined}
                max={endDate || undefined}
                onChange={(e) => setDay(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Start time</label>
              <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Creating…" : "Create scramble"}
          </button>
        </form>
      </Modal>
    </>
  );
}
