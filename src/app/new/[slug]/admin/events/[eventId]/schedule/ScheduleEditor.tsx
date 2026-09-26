"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import {
  SCHEDULE_KINDS as KINDS,
  ACTIVITY_TYPES,
  ACTIVITY_LABEL,
  fmtTime,
  fmtDateShort,
  sortDayItems,
  type ScheduleItem,
} from "@/lib/v2/schedule";
import styles from "@/app/new/new.module.css";

export type { ScheduleItem };

function headerLabel(ymd: string, today: string): string {
  const d = new Date(ymd + "T00:00:00");
  const now = new Date(today + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    ...(d.getFullYear() !== now.getFullYear() ? { year: "numeric" } : {}),
  });
}

const emptyForm = {
  title: "",
  kind: "general" as ScheduleItem["kind"],
  day: "",
  end_day: "",
  all_day: false,
  start_time: "",
  end_time: "",
  location: "",
  description: "",
  activity_type: "",
};

/**
 * Admin schedule builder — an Apple-Calendar-style List view: everything you've
 * scheduled, grouped under date headers in chronological order. Add on any date.
 */
export default function ScheduleEditor({
  orgId,
  eventId,
  today,
  initialItems,
}: {
  orgId: string;
  eventId: string;
  today: string; // YYYY-MM-DD (simulator-aware)
  initialItems: ScheduleItem[];
}) {
  const [items, setItems] = useState<ScheduleItem[]>(initialItems);
  const [editing, setEditing] = useState<ScheduleItem | "new" | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<ScheduleItem | null>(null);

  // Group by start day, chronologically — only days that actually have items.
  const groups = useMemo(() => {
    const byDay = new Map<string, ScheduleItem[]>();
    for (const it of items) (byDay.get(it.day) || byDay.set(it.day, []).get(it.day)!).push(it);
    return [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([day, its]) => ({ day, items: sortDayItems(its) }));
  }, [items]);

  // Open scrolled to the next upcoming day, leaving past days to scroll up to.
  // Only when there ARE past days above (otherwise the natural top is correct).
  const upcomingIdx = useMemo(() => groups.findIndex((g) => g.day >= today), [groups, today]);
  const upcomingDay = upcomingIdx > 0 ? groups[upcomingIdx].day : null;
  const nextRef = useRef<HTMLDivElement>(null);
  const scrolled = useRef(false);
  useEffect(() => {
    if (scrolled.current || !upcomingDay || !nextRef.current) return;
    scrolled.current = true;
    nextRef.current.scrollIntoView({ block: "start" });
  }, [upcomingDay]);

  function openNew() {
    setForm({ ...emptyForm, day: today });
    setError(null);
    setEditing("new");
  }
  function openEdit(it: ScheduleItem) {
    setForm({
      title: it.title,
      kind: it.kind,
      day: it.day,
      end_day: it.end_day || "",
      all_day: it.all_day,
      start_time: it.start_time ? it.start_time.slice(0, 5) : "",
      end_time: it.end_time ? it.end_time.slice(0, 5) : "",
      location: it.location || "",
      description: it.description || "",
      activity_type: it.activity_type || "",
    });
    setError(null);
    setEditing(it);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim() || busy) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.day)) {
      setError("Pick a start date");
      return;
    }
    if (form.end_day && form.end_day < form.day) {
      setError("End date can't be before the start date");
      return;
    }
    setBusy(true);
    setError(null);
    const payload = {
      title: form.title.trim(),
      kind: form.kind,
      day: form.day,
      end_day: form.end_day || null,
      all_day: form.all_day,
      start_time: form.all_day ? null : form.start_time || null,
      end_time: form.all_day ? null : form.end_time || null,
      location: form.location.trim() || null,
      description: form.description.trim() || null,
      activity_type: form.kind === "activity" ? form.activity_type || null : null,
    };
    const isNew = editing === "new";
    const base = `/api/v2/orgs/${orgId}/events/${eventId}/schedule`;
    const res = await fetch(isNew ? base : `${base}/${(editing as ScheduleItem).id}`, {
      method: isNew ? "POST" : "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    const { item } = await res.json();
    setItems((prev) => (isNew ? [...prev, item] : prev.map((x) => (x.id === item.id ? item : x))));
    setEditing(null);
  }

  async function remove(it: ScheduleItem) {
    setItems((prev) => prev.filter((x) => x.id !== it.id));
    await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/schedule/${it.id}`, { method: "DELETE" });
  }

  return (
    <div>
      <div className={styles.titleRow}>
        <h1 className={styles.title}>Schedule</h1>
        <button type="button" className={styles.circleAdd} aria-label="Add schedule item" onClick={openNew}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
          </svg>
        </button>
      </div>

      {groups.length === 0 ? (
        <p className={styles.dnsHint}>Nothing scheduled yet. Add registration dates, meals, matches — anything, on any date.</p>
      ) : (
        <div className={styles.schedGroups}>
          {groups.map((g) => (
            <div key={g.day} className={styles.schedGroup} ref={g.day === upcomingDay ? nextRef : null}>
              <div className={styles.schedDateHead}>
                {headerLabel(g.day, today)}
                {g.day === today && <span className={styles.schedToday}>Today</span>}
              </div>
              <div className={styles.schedList}>
                {g.items.map((it) => (
                  <button key={it.id} type="button" className={styles.schedItem} onClick={() => openEdit(it)}>
                    <span className={styles.schedTime}>{it.all_day ? "All day" : fmtTime(it.start_time) || "—"}</span>
                    <span className={styles.schedItemMain}>
                      <span className={styles.schedItemTitle}>{it.title}</span>
                      {it.end_day && it.end_day !== it.day && (
                        <span className={styles.schedItemMeta}>
                          {fmtDateShort(it.day)} – {fmtDateShort(it.end_day)}
                        </span>
                      )}
                      {(it.location || (it.kind === "activity" && it.activity_type)) && (
                        <span className={styles.schedItemMeta}>
                          {it.kind === "activity" && it.activity_type ? ACTIVITY_LABEL[it.activity_type] || it.activity_type : ""}
                          {it.kind === "activity" && it.activity_type && it.location ? ", " : ""}
                          {it.location || ""}
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={editing !== null} title={editing === "new" ? "New item" : "Edit item"} onClose={() => setEditing(null)}>
        <form className={styles.form} onSubmit={save}>
          <div className={styles.field}>
            <label className={styles.label}>Title</label>
            <input className={styles.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Ryder Cup, Dinner, Michigan vs OSU" maxLength={120} autoFocus />
          </div>

          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Start date</label>
              <input className={styles.input} type="date" value={form.day} onChange={(e) => setForm({ ...form, day: e.target.value })} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>End date <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} type="date" value={form.end_day} min={form.day || undefined} onChange={(e) => setForm({ ...form, end_day: e.target.value })} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Type</label>
            <div className={styles.wizSegToggle} role="group" aria-label="Item type" style={{ flexWrap: "wrap" }}>
              {KINDS.map((k) => (
                <button key={k.key} type="button" className={styles.wizSegOption} data-on={form.kind === k.key || undefined} onClick={() => setForm({ ...form, kind: k.key })}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          {form.kind === "activity" && (
            <div className={styles.field}>
              <label className={styles.label}>Activity <span className={styles.optional}>(module — coming soon)</span></label>
              <select className={styles.roleSelect} value={form.activity_type} onChange={(e) => setForm({ ...form, activity_type: e.target.value })}>
                <option value="">Unspecified</option>
                {ACTIVITY_TYPES.map((a) => (
                  <option key={a.key} value={a.key}>{a.label}</option>
                ))}
              </select>
            </div>
          )}

          <label className={styles.profileToggle}>
            <input type="checkbox" checked={form.all_day} onChange={(e) => setForm({ ...form, all_day: e.target.checked })} />
            <span>All day</span>
          </label>

          {!form.all_day && (
            <div className={styles.profileTwoCol}>
              <div className={styles.field}>
                <label className={styles.label}>Start</label>
                <input className={styles.input} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
              </div>
              <div className={styles.field}>
                <label className={styles.label}>End <span className={styles.optional}>(optional)</span></label>
                <input className={styles.input} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
              </div>
            </div>
          )}

          <div className={styles.field}>
            <label className={styles.label}>Location <span className={styles.optional}>(optional)</span></label>
            <input className={styles.input} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="e.g. Thorn Apple CC" maxLength={120} />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Notes <span className={styles.optional}>(optional)</span></label>
            <textarea className={styles.textarea} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} placeholder="Menu, details, etc." />
          </div>

          {error && <p className={styles.formError}>{error}</p>}

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" className={styles.createBtn} disabled={busy || !form.title.trim()} style={{ opacity: busy || !form.title.trim() ? 0.6 : 1 }}>
              {busy ? "Saving…" : editing === "new" ? "Add item" : "Save changes"}
            </button>
            {editing !== "new" && editing && (
              <button type="button" className={styles.wizBackLink} style={{ color: "#a3341f" }} onClick={() => setConfirmDel(editing as ScheduleItem)}>
                Delete
              </button>
            )}
          </div>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title="Delete item?"
        message={confirmDel ? `Remove "${confirmDel.title}" from the schedule?` : undefined}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          const it = confirmDel;
          setConfirmDel(null);
          setEditing(null);
          if (it) remove(it);
        }}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
