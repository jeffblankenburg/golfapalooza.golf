"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import CourseLookupModal from "@/components/v2/courses/CourseLookupModal";
import CustomTeeBuilder from "./CustomTeeBuilder";
import styles from "@/app/new/new.module.css";

interface Tee { id: string; tee_name: string; tee_color: string | null; par: number; course_rating: number | null; slope_rating: number | null }
export interface CourseOption { id: string; name: string; city: string | null; state: string | null }

/** config.hole_tees is stored with string keys ("1".."18"); convert to number keys. */
function readHoleTees(config: Record<string, unknown> | null): Record<number, string> | null {
  const ht = config?.hole_tees as Record<string, string> | null | undefined;
  if (!ht || typeof ht !== "object") return null;
  const out: Record<number, string> = {};
  for (const [k, v] of Object.entries(ht)) out[Number(k)] = v;
  return Object.keys(out).length ? out : null;
}

/**
 * Edit or delete a contest (#209). Name, date, start time, and the course + tee
 * (which supplies per-hole par for scoring) are editable. The course is picked
 * from the EXISTING library; "Add a course" is a rarely-used escape hatch.
 */
export default function ContestSettings({
  slug,
  orgId,
  eventId,
  contestId,
  name: initialName,
  contestDate,
  startTime,
  courseId: initialCourseId,
  teeId: initialTeeId,
  courseName: initialCourseName,
  entryAmountCents,
  courses,
  config,
}: {
  slug: string;
  orgId: string;
  eventId: string;
  contestId: string;
  name: string;
  contestDate: string | null;
  startTime: string | null;
  courseId: string | null;
  teeId: string | null;
  courseName: string | null;
  entryAmountCents: number | null;
  courses: CourseOption[];
  config: Record<string, unknown> | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [teePickerOpen, setTeePickerOpen] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [name, setName] = useState(initialName);
  const [day, setDay] = useState(contestDate || "");
  const [time, setTime] = useState(startTime ? startTime.slice(0, 5) : "");
  const [buyin, setBuyin] = useState(entryAmountCents != null ? (entryAmountCents / 100).toString() : "");
  const [courseId, setCourseId] = useState<string | null>(initialCourseId);
  const [teeId, setTeeId] = useState<string | null>(initialTeeId);
  const [courseName, setCourseName] = useState<string | null>(initialCourseName);
  const [tees, setTees] = useState<Tee[]>([]);
  const [holesByTee, setHolesByTee] = useState<Record<string, { hole_number: number; handicap_index: number; par: number }[]>>({});
  const [holeTees, setHoleTees] = useState<Record<number, string> | null>(readHoleTees(config));
  const [builderOpen, setBuilderOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const base = `/api/v2/orgs/${orgId}/events/${eventId}/contests/${contestId}`;

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return courses;
    return courses.filter((c) => `${c.name} ${c.city || ""} ${c.state || ""}`.toLowerCase().includes(q));
  }, [filter, courses]);

  async function loadTees(cid: string, preferTee: string | null) {
    try {
      const res = await fetch(`/api/v2/courses/${cid}`);
      const d = res.ok ? await res.json() : { tees: [] };
      const ts: Tee[] = (d.tees || []).map((t: { id: string; tee_name: string; tee_color: string | null; par: number; course_rating: number | null; slope_rating: number | null }) => ({ id: t.id, tee_name: t.tee_name, tee_color: t.tee_color ?? null, par: t.par, course_rating: t.course_rating ?? null, slope_rating: t.slope_rating ?? null }));
      setTees(ts);
      setHolesByTee(d.holes_by_tee || {});
      setTeeId(preferTee && ts.some((t) => t.id === preferTee) ? preferTee : ts[0]?.id ?? null);
    } catch {
      setTees([]);
    }
  }

  function openEdit() {
    setName(initialName);
    setDay(contestDate || "");
    setTime(startTime ? startTime.slice(0, 5) : "");
    setBuyin(entryAmountCents != null ? (entryAmountCents / 100).toString() : "");
    setCourseId(initialCourseId);
    setTeeId(initialTeeId);
    setCourseName(initialCourseName);
    setHoleTees(readHoleTees(config));
    setTees([]);
    setError(null);
    setOpen(true);
    if (initialCourseId) loadTees(initialCourseId, initialTeeId);
  }

  // Only one modal is visible at a time (settings / picker / lookup) — avoids the
  // z-order fight between our Modal (z-100) and CourseLookupModal (z-58).
  function openPicker() { setOpen(false); setFilter(""); setPickerOpen(true); }
  function closePicker() { setPickerOpen(false); setOpen(true); }
  function selectCourse(id: string, cname: string) {
    setCourseId(id);
    setCourseName(cname);
    setHoleTees(null); // a custom mix is course-specific; reset on course change
    setPickerOpen(false);
    setLookupOpen(false);
    setOpen(true);
    loadTees(id, null); // default to the new course's first tee
  }
  function openLookup() { setPickerOpen(false); setLookupOpen(true); }
  function cancelLookup() { setLookupOpen(false); setPickerOpen(true); }

  // Tee selection: a standard/course tee vs a contest-only custom per-hole mix,
  // chosen from a picker (only one modal open at a time).
  function openTeePicker() { setOpen(false); setTeePickerOpen(true); }
  function closeTeePicker() { setTeePickerOpen(false); setOpen(true); }
  function selectStandardTee(id: string) { setTeeId(id); setHoleTees(null); setTeePickerOpen(false); setOpen(true); }
  function openBuilderFromPicker() { setTeePickerOpen(false); setBuilderOpen(true); }
  function saveBuilder(basis: string, holes: Record<number, string>) {
    setTeeId(basis);
    setHoleTees(holes);
    setBuilderOpen(false);
    setOpen(true);
  }
  function cancelBuilder() { setBuilderOpen(false); setOpen(true); }

  const teeName = (id: string | null) => tees.find((t) => t.id === id)?.tee_name || "Tee";
  const selectedTee = tees.find((t) => t.id === teeId);
  const selectedTeeLabel = selectedTee ? `${selectedTee.tee_name} (Par ${selectedTee.par})` : "Choose tee";
  const teeMeta = (t: Tee) => `Par ${t.par}${t.course_rating != null && t.slope_rating != null ? `, ${t.course_rating} / ${t.slope_rating}` : ""}`;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) { setError("Name can't be empty"); return; }
    if (day && !/^\d{4}-\d{2}-\d{2}$/.test(day)) { setError("Pick a valid date"); return; }
    setBusy(true);
    setError(null);
    // Custom mix lives in config.hole_tees (contest-only); clear it in standard mode.
    const holeTeesObj = holeTees ? Object.fromEntries(Object.entries(holeTees).map(([k, v]) => [String(k), v])) : null;
    const nextConfig = { ...(config || {}), hole_tees: holeTeesObj };
    const cents = buyin.trim() ? Math.round(parseFloat(buyin) * 100) : null;
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), contest_date: day || null, start_time: time || null, course_id: courseId, tee_id: teeId, config: nextConfig, entry_amount_cents: Number.isFinite(cents as number) ? cents : null }),
    });
    setBusy(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (busy) return;
    setBusy(true);
    const res = await fetch(base, { method: "DELETE" });
    if (!res.ok) { setBusy(false); setConfirm(false); return; }
    router.replace(`/new/${slug}/admin/events/${eventId}/contests`);
    router.refresh();
  }

  return (
    <>
      <button type="button" className={styles.circleAdd} aria-label="Contest settings" onClick={openEdit}>
        <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" />
        </svg>
      </button>

      <Modal open={open} title="Contest settings" onClose={() => setOpen(false)}>
        <form className={styles.form} onSubmit={save}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          </div>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Date</label>
              <input className={styles.input} type="date" value={day} onChange={(e) => setDay(e.target.value)} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Start time</label>
              <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Buy-in <span className={styles.optional}>($ per player, shows on Financials)</span></label>
            <input className={styles.input} inputMode="decimal" value={buyin} onChange={(e) => setBuyin(e.target.value)} placeholder="0" />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Course <span className={styles.optional}>(for scoring par)</span></label>
            {courseId ? (
              <div className={styles.coursePicked}>
                <span className={styles.coursePickedName}>{courseName || "Course"}</span>
                <button type="button" className={styles.linkAction} onClick={openPicker}>Change</button>
              </div>
            ) : (
              <button type="button" className={styles.pickBtn} onClick={openPicker}>Choose course</button>
            )}
          </div>
          {courseId && tees.length > 0 && (
            <div className={styles.field}>
              <label className={styles.label}>Tee</label>
              <button type="button" className={styles.teeBox} onClick={openTeePicker}>
                <span className={styles.teeBoxMain}>
                  {holeTees ? (
                    <>
                      <span className={styles.coursePickedName}>Custom Tees</span>
                      <span className={styles.coursePickMeta}>Basis: {teeName(teeId)}</span>
                    </>
                  ) : (
                    <span className={styles.coursePickedName}>{selectedTeeLabel}</span>
                  )}
                </span>
                <span className={styles.linkAction}>Change</span>
              </button>
            </div>
          )}

          {error && <p className={styles.formError}>{error}</p>}

          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              {busy ? "Saving…" : "Save changes"}
            </button>
            <button type="button" className={styles.deleteBtn} onClick={() => setConfirm(true)} disabled={busy}>
              Delete contest
            </button>
          </div>
        </form>
      </Modal>

      {/* Pick from the existing course library. */}
      <Modal open={pickerOpen} title="Choose course" onClose={closePicker}>
        <input
          className={styles.input}
          placeholder="Filter courses…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ marginBottom: 12 }}
          autoFocus
        />
        {filtered.length === 0 ? (
          <p className={styles.dnsHint}>No courses match. Add one below.</p>
        ) : (
          <div className={styles.coursePickList}>
            {filtered.map((c) => (
              <button key={c.id} type="button" className={styles.coursePickRow} data-on={c.id === courseId || undefined} onClick={() => selectCourse(c.id, c.name)}>
                <span className={styles.coursePickName}>{c.name}</span>
                {(c.city || c.state) && <span className={styles.coursePickMeta}>{[c.city, c.state].filter(Boolean).join(", ")}</span>}
              </button>
            ))}
          </div>
        )}
        <button type="button" className={styles.pickBtn} style={{ marginTop: 14 }} onClick={openLookup}>+ Add a course</button>
      </Modal>

      {/* Pick the tee: a standard/course tee, or a contest-only custom mix. */}
      <Modal open={teePickerOpen} title="Choose tee" onClose={closeTeePicker}>
        <div className={styles.coursePickList}>
          {tees.map((t) => (
            <button key={t.id} type="button" className={styles.coursePickRow} data-on={(!holeTees && teeId === t.id) || undefined} onClick={() => selectStandardTee(t.id)}>
              <span className={styles.coursePickName}>{t.tee_name}</span>
              <span className={styles.coursePickMeta}>{teeMeta(t)}</span>
            </button>
          ))}
          <button type="button" className={styles.coursePickRow} data-on={!!holeTees || undefined} onClick={openBuilderFromPicker}>
            <span className={styles.coursePickName}>Custom Tees{holeTees ? " (edit)" : "…"}</span>
            <span className={styles.coursePickMeta}>A different tee per hole</span>
          </button>
        </div>
      </Modal>

      {lookupOpen && (
        <CourseLookupModal
          onClose={cancelLookup}
          onCourseReady={(c) => selectCourse(c.id, c.name)}
          onManualFallback={cancelLookup}
        />
      )}

      {builderOpen && (
        <CustomTeeBuilder
          tees={tees}
          holesByTee={holesByTee}
          initialBasis={teeId}
          initialHoles={holeTees}
          onSave={saveBuilder}
          onCancel={cancelBuilder}
        />
      )}

      <ConfirmModal
        open={confirm}
        title="Delete contest?"
        message={`Remove "${initialName}"? This deletes its teams, scores, and any side games, and removes it from the calendar.`}
        confirmLabel={busy ? "Deleting…" : "Delete"}
        destructive
        onConfirm={remove}
        onCancel={() => !busy && setConfirm(false)}
      />
    </>
  );
}
