"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import ConfirmModal from "../_components/ConfirmModal";
import Modal from "../_components/Modal";
import styles from "../new.module.css";

interface EventRow {
  id: string;
  name: string;
  year: number | null;
  start_date: string | null;
  end_date: string | null;
  status: "draft" | "active" | "archived";
  location: string | null;
}

const empty = { name: "", year: "", start_date: "", end_date: "", status: "draft", location: "" };

export default function EventsSection({
  orgId,
  slug,
  isAdmin,
}: {
  orgId: string;
  slug: string;
  isAdmin: boolean;
}) {
  const [events, setEvents] = useState<EventRow[]>([]);
  const [editing, setEditing] = useState<EventRow | "new" | null>(null);
  const [form, setForm] = useState({ ...empty });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<EventRow | null>(null);

  const fetchEvents = useCallback(async (): Promise<EventRow[]> => {
    const r = await fetch(`/api/v2/orgs/${orgId}/events`);
    return r.ok ? (await r.json()).events || [] : [];
  }, [orgId]);

  useEffect(() => {
    let active = true;
    (async () => {
      const e = await fetchEvents();
      if (active) setEvents(e);
    })();
    return () => {
      active = false;
    };
  }, [fetchEvents]);

  function openNew() {
    setForm({ ...empty });
    setError(null);
    setEditing("new");
  }
  function openEdit(e: EventRow) {
    setForm({
      name: e.name,
      year: e.year != null ? String(e.year) : "",
      start_date: e.start_date || "",
      end_date: e.end_date || "",
      status: e.status,
      location: e.location || "",
    });
    setError(null);
    setEditing(e);
  }

  async function save(ev: React.FormEvent) {
    ev.preventDefault();
    if (!form.name.trim() || busy) return;
    setBusy(true);
    setError(null);
    const payload = {
      name: form.name.trim(),
      year: form.year ? parseInt(form.year, 10) : null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      status: form.status,
      location: form.location.trim() || null,
    };
    const isNew = editing === "new";
    const res = await fetch(
      isNew ? `/api/v2/orgs/${orgId}/events` : `/api/v2/orgs/${orgId}/events/${(editing as EventRow).id}`,
      {
        method: isNew ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }
    );
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    setEditing(null);
    setEvents(await fetchEvents());
  }

  async function remove(id: string) {
    await fetch(`/api/v2/orgs/${orgId}/events/${id}`, { method: "DELETE" });
    setEvents(await fetchEvents());
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Events</p>
        {isAdmin && (
          <button type="button" className={styles.circleAddSm} aria-label="New event" onClick={openNew}>
            <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
            </svg>
          </button>
        )}
      </div>

      {events.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 0 }}>
          {isAdmin ? "No events yet. Tap + to create one." : "No events yet."}
        </p>
      ) : (
        <ul className={styles.memberList}>
          {events.map((e) => (
            <li key={e.id} className={styles.memberRow}>
              <Link
                href={`/new/${slug}/admin/events/${e.id}`}
                className={styles.memberMeta}
                style={{ textDecoration: "none" }}
              >
                <span className={styles.memberName}>
                  {e.name}
                  {e.year ? ` (${e.year})` : ""}
                </span>
              </Link>
              <span className={styles.eventStatus}>{e.status}</span>
              {isAdmin ? (
                <>
                  <button type="button" className={styles.removeBtn} onClick={() => openEdit(e)}>
                    Edit
                  </button>
                  <button type="button" className={styles.removeBtn} onClick={() => setConfirmDel(e)}>
                    Delete
                  </button>
                </>
              ) : (
                <Link href={`/new/${slug}/admin/events/${e.id}`} aria-label={`Open ${e.name}`}>
                  <svg className={styles.arrow} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" />
                  </svg>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={editing !== null}
        title={editing === "new" ? "New event" : "Edit event"}
        onClose={() => setEditing(null)}
      >
        <form className={styles.form} onSubmit={save}>
          <div className={styles.field}>
            <label className={styles.label}>Event name</label>
            <input
              className={styles.input}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Golfapalooza XXXI"
              maxLength={80}
              autoFocus
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Year <span className={styles.optional}>(optional)</span></label>
            <input
              className={styles.input}
              inputMode="numeric"
              value={form.year}
              onChange={(e) => setForm({ ...form, year: e.target.value.replace(/\D/g, "").slice(0, 4) })}
              placeholder="2027"
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Start date <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} type="date" value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>End date <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} type="date" value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Location <span className={styles.optional}>(optional)</span></label>
            <input
              className={styles.input}
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              placeholder="e.g. Thorn Apple Country Club, Grand Rapids, MI"
              maxLength={120}
            />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Status</label>
            <select className={styles.roleSelect} value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}>
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </div>
          {form.status === "active" && (
            <p className={styles.dnsHint} style={{ marginTop: 0 }}>
              Making this active will archive any other active event.
            </p>
          )}
          {error && <p className={styles.formError}>{error}</p>}
          <button type="submit" className={styles.createBtn} disabled={busy || !form.name.trim()}>
            {busy ? "Saving…" : editing === "new" ? "Create event" : "Save changes"}
          </button>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title="Delete event?"
        message={confirmDel ? `Delete "${confirmDel.name}"? This can't be undone.` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const e = confirmDel;
          setConfirmDel(null);
          if (e) remove(e.id);
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
