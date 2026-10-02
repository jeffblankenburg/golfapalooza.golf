"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  DndContext, closestCenter, PointerSensor, TouchSensor, useSensor, useSensors, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import styles from "@/app/new/new.module.css";

export interface CostCategoryOption { key: string; label: string; icon: string | null }

export interface CostItem {
  id: string;
  name: string;
  amount_cents: number;
  category: string | null;
  included_in_trip_cost: boolean;
  linked_option_id: string | null;
  source_type: string;
  source_id: string | null;
  notes: string | null;
  sort_order: number;
  // Resolved on the server: which group this item lands in (a contest or a category).
  group_key: string;
  group_label: string;
}

// Order within a group: admin's manual order (sort_order) wins; then the contest's
// own buy-in before its side games before anything else; alphabetical as the tiebreak.
function rowRank(i: CostItem): number {
  return i.source_type === "contest" ? 0 : i.source_type === "side_game" ? 1 : 2;
}
function sortInGroup(a: CostItem, b: CostItem): number {
  return a.sort_order - b.sort_order || rowRank(a) - rowRank(b) || a.name.localeCompare(b.name);
}

function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * The event's cost catalog (#213). Add/edit/delete manual items, reconcile each to
 * the Trip Cost, and see the rolled-up totals. Auto items (contest/side-game
 * buy-ins) appear read-only here once phase 2 wires them in.
 */
export default function FinancialsManager({ slug, orgId, eventId, initialItems, categories }: { slug: string; orgId: string; eventId: string; initialItems: CostItem[]; categories: CostCategoryOption[] }) {
  const catLabel = useMemo(() => new Map(categories.map((c) => [c.key, c.label])), [categories]);
  const [items, setItems] = useState<CostItem[]>(initialItems);
  const [formFor, setFormFor] = useState<CostItem | "new" | null>(null);
  const [confirmDel, setConfirmDel] = useState<CostItem | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(categories[0]?.key || "other");
  const [inTrip, setInTrip] = useState(true);
  const [notes, setNotes] = useState("");

  const base = `/api/v2/orgs/${orgId}/events/${eventId}/cost-items`;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const tripTotal = useMemo(() => items.filter((i) => i.included_in_trip_cost).reduce((s, i) => s + i.amount_cents, 0), [items]);
  const grandTotal = useMemo(() => items.reduce((s, i) => s + i.amount_cents, 0), [items]);
  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; list: CostItem[] }>();
    for (const i of items) {
      const g = byKey.get(i.group_key) || byKey.set(i.group_key, { label: i.group_label, list: [] }).get(i.group_key)!;
      g.list.push(i);
    }
    for (const g of byKey.values()) g.list.sort(sortInGroup);
    // Contest groups first, then category groups; alphabetical by label within each.
    return [...byKey.entries()].sort((a, b) => {
      const ac = a[0].startsWith("contest:") ? 0 : 1;
      const bc = b[0].startsWith("contest:") ? 0 : 1;
      return ac - bc || a[1].label.localeCompare(b[1].label);
    });
  }, [items]);

  // New/edited manual items get their category group client-side; auto items keep
  // the group the server resolved (carried from the row being replaced).
  function applyGroup(fresh: CostItem, prev?: CostItem): CostItem {
    if (fresh.source_type !== "manual" && prev) return { ...fresh, group_key: prev.group_key, group_label: prev.group_label };
    const cat = fresh.category || "other";
    return { ...fresh, group_key: `cat:${cat}`, group_label: catLabel.get(cat) || cat };
  }

  function openAdd() { setName(""); setAmount(""); setCategory("other"); setInTrip(true); setNotes(""); setError(null); setFormFor("new"); }
  function openEdit(i: CostItem) {
    setName(i.name); setAmount((i.amount_cents / 100).toString()); setCategory(i.category || "other"); setInTrip(i.included_in_trip_cost); setNotes(i.notes || ""); setError(null); setFormFor(i);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || formFor == null) return;
    if (!name.trim()) { setError("Name is required"); return; }
    setBusy(true); setError(null);
    const editingAuto = formFor !== "new" && formFor.source_type !== "manual";
    // New items land at the end of their (category) group.
    const nextSort = formFor === "new"
      ? items.filter((i) => i.group_key === `cat:${category}`).reduce((m, i) => Math.max(m, i.sort_order), -1) + 1
      : undefined;
    // Auto items (contest buy-ins): only amount + reconciliation are owned here;
    // name/category mirror the contest and are left alone.
    const trimmedNotes = notes.trim() || null;
    const payload = editingAuto
      ? { amount_cents: amount.trim() ? Math.round(parseFloat(amount) * 100) : 0, included_in_trip_cost: inTrip, notes: trimmedNotes }
      : {
          name: name.trim(),
          amount_cents: amount.trim() ? Math.round(parseFloat(amount) * 100) : 0,
          category,
          included_in_trip_cost: inTrip,
          notes: trimmedNotes,
          ...(nextSort !== undefined ? { sort_order: nextSort } : {}),
        };
    const res = formFor === "new"
      ? await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
      : await fetch(`${base}/${formFor.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
    setBusy(false);
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
    const { item } = await res.json();
    setItems((prev) => (formFor === "new"
      ? [...prev, applyGroup(item)]
      : prev.map((x) => (x.id === item.id ? applyGroup(item, x) : x))));
    setFormFor(null);
  }

  // Auto items (contest buy-ins) are edited at their source, but their
  // reconciliation (in/out of Trip Cost) is set here.
  async function toggleTrip(i: CostItem) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`${base}/${i.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ included_in_trip_cost: !i.included_in_trip_cost }),
    });
    setBusy(false);
    if (res.ok) { const { item } = await res.json(); setItems((prev) => prev.map((x) => (x.id === item.id ? applyGroup(item, x) : x))); }
    else setError((await res.json().catch(() => ({}))).error || "Could not update");
  }

  // Reorder within a single group (never across groups — each group is its own
  // DndContext). Assigns sequential sort_order and persists only what moved.
  async function handleDragEnd(groupKey: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const groupItems = items.filter((i) => i.group_key === groupKey).slice().sort(sortInGroup);
    const oldIdx = groupItems.findIndex((i) => i.id === active.id);
    const newIdx = groupItems.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = arrayMove(groupItems, oldIdx, newIdx);
    const nextSort = new Map(reordered.map((it, idx) => [it.id, idx]));
    const changed = reordered.filter((it, idx) => it.sort_order !== idx).map((it) => ({ id: it.id, idx: nextSort.get(it.id)! }));

    const before = items;
    setItems((prev) => prev.map((it) => (nextSort.has(it.id) ? { ...it, sort_order: nextSort.get(it.id)! } : it)));
    try {
      await Promise.all(changed.map((c) =>
        fetch(`${base}/${c.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: c.idx }) })
          .then((r) => { if (!r.ok) throw new Error("reorder failed"); })));
      setError(null);
    } catch {
      setItems(before);
      setError("Could not save the new order");
    }
  }

  async function remove(i: CostItem) {
    setBusy(true);
    const res = await fetch(`${base}/${i.id}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) { setItems((prev) => prev.filter((x) => x.id !== i.id)); setConfirmDel(null); }
    else { setError((await res.json().catch(() => ({}))).error || "Could not remove"); setConfirmDel(null); }
  }

  return (
    <div>
      <div className={styles.finSummary}>
        <div className={styles.finSummaryItem}>
          <span className={styles.finSummaryLabel} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span className={styles.finCheck} data-on aria-hidden style={{ width: 15, height: 15, cursor: "default", pointerEvents: "none" }}>
              <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={4} strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>
            </span>
            Trip Cost
          </span>
          <span className={styles.finSummaryVal}>{dollars(tripTotal)}</span>
        </div>
        <div className={styles.finSummaryItem}>
          <span className={styles.finSummaryLabel}>All items</span>
          <span className={styles.finSummaryVal} data-muted>{dollars(grandTotal)}</span>
        </div>
      </div>

      <div className={styles.titleRow} style={{ marginTop: 20 }}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Cost items</p>
        <button type="button" className={styles.circleAdd} aria-label="Add cost item" onClick={openAdd}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      {items.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 10 }}>No cost items yet. Add lodging, meals, shirts, or anything with a price.</p>
      ) : (
        <div className={styles.finGroups}>
          {groups.map(([key, { label, list }]) => (
            <div key={key} className={styles.finGroup}>
              <p className={styles.finGroupHead}>{label}</p>
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleDragEnd(key, e)}>
                <SortableContext items={list.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                  {list.map((i) => (
                    <FinRow
                      key={i.id}
                      item={i}
                      groupKey={key}
                      slug={slug}
                      eventId={eventId}
                      busy={busy}
                      onEdit={openEdit}
                      onToggleTrip={toggleTrip}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            </div>
          ))}
        </div>
      )}

      <Modal open={formFor !== null} title={formFor === "new" ? "Add cost item" : "Edit cost item"} onClose={() => setFormFor(null)}>
        {(() => {
          const editingAuto = formFor !== "new" && formFor !== null && formFor.source_type !== "manual";
          return (
            <form className={styles.form} onSubmit={submit}>
              {editingAuto ? (
                <p className={styles.dnsHint} style={{ marginTop: 0 }}>
                  <strong>{name}</strong> comes from a contest. Its name is set there; set the amount and whether it&apos;s part of the Trip Cost here.
                </p>
              ) : (
                <div className={styles.field}>
                  <label className={styles.label}>Name</label>
                  <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Saturday lodging" maxLength={120} autoFocus />
                </div>
              )}
              <div className={styles.profileTwoCol}>
                <div className={styles.field}>
                  <label className={styles.label}>Amount <span className={styles.optional}>($)</span></label>
                  <input className={styles.input} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
                </div>
                {!editingAuto && (
                  <div className={styles.field}>
                    <label className={styles.label}>Category</label>
                    <select className={styles.selectInput} value={category} onChange={(e) => setCategory(e.target.value)}>
                      {categories.map((c) => <option key={c.key} value={c.key}>{c.icon ? `${c.icon} ` : ""}{c.label}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Description <span className={styles.optional}>(optional, admins only)</span></label>
                <textarea className={styles.textarea} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Extra context if the name isn't clear" maxLength={300} />
              </div>
              <label className={styles.profileToggle}>
                <input type="checkbox" checked={inTrip} onChange={(e) => setInTrip(e.target.checked)} />
                <span>Include in Trip Cost</span>
              </label>

              {error && <p className={styles.formError}>{error}</p>}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
                  {busy ? "Saving…" : formFor === "new" ? "Add cost item" : "Save changes"}
                </button>
                {!editingAuto && formFor !== "new" && formFor && (
                  <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDel(formFor)} disabled={busy}>Delete cost item</button>
                )}
              </div>
            </form>
          );
        })()}
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title="Delete cost item?"
        message={confirmDel ? `Remove "${confirmDel.name}" (${dollars(confirmDel.amount_cents)})?` : undefined}
        confirmLabel={busy ? "Deleting…" : "Delete"}
        destructive
        onConfirm={() => { const it = confirmDel; setConfirmDel(null); setFormFor(null); if (it) remove(it); }}
        onCancel={() => !busy && setConfirmDel(null)}
      />
    </div>
  );
}

/** One draggable cost-item row. Drag handle only reorders within its group. */
function FinRow({ item, groupKey, slug, eventId, busy, onEdit, onToggleTrip }: {
  item: CostItem;
  groupKey: string;
  slug: string;
  eventId: string;
  busy: boolean;
  onEdit: (i: CostItem) => void;
  onToggleTrip: (i: CostItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };

  const auto = item.source_type !== "manual";
  // Inside a contest group, the contest's own line is its buy-in (the group header
  // already names the contest); side games keep their name.
  const rowName = groupKey.startsWith("contest:") && item.source_type === "contest" ? "Buy-in" : item.name;
  const contestHref = auto && groupKey.startsWith("contest:")
    ? `/new/${slug}/admin/events/${eventId}/contests/${groupKey.slice("contest:".length)}`
    : null;

  return (
    <div ref={setNodeRef} style={style} className={styles.finRow}>
      <button type="button" className={styles.finGrab} aria-label="Drag to reorder" {...listeners} {...attributes}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
          <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" />
          <circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" />
          <circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
        </svg>
      </button>
      <button
        type="button"
        className={styles.finCheck}
        data-on={item.included_in_trip_cost || undefined}
        onClick={() => onToggleTrip(item)}
        disabled={busy}
        aria-pressed={item.included_in_trip_cost}
        aria-label={item.included_in_trip_cost ? "In Trip Cost — tap to remove" : "Not in Trip Cost — tap to add"}
        title={item.included_in_trip_cost ? "In Trip Cost" : "Not in Trip Cost"}
      >
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 13l4 4L19 7" /></svg>
      </button>
      <div className={styles.finRowMain}>
        <span className={styles.finRowName}>
          {rowName}
          {auto && (contestHref
            ? <Link href={contestHref} className={styles.finAutoTag} data-link title="Open the contest to edit this">auto</Link>
            : <span className={styles.finAutoTag}>auto</span>)}
          <button type="button" className={styles.sideEditBtn} aria-label="Edit cost item" onClick={() => onEdit(item)}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
          </button>
        </span>
        {item.notes && <span className={styles.finRowNote}>{item.notes}</span>}
      </div>
      <span className={styles.finRowAmount}>{dollars(item.amount_cents)}</span>
    </div>
  );
}
