"use client";

import { useState } from "react";
import {
  DndContext, closestCorners, PointerSensor, TouchSensor, useSensor, useSensors, useDroppable, type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { OPTION_TYPES, typeHasChoices, type OptionType, type OptionChoice, type OptionSettings } from "@/lib/v2/options";
import { OPTION_ICON_CATEGORIES } from "@/lib/v2/option-icons";
import styles from "@/app/new/new.module.css";

export interface OptItem {
  id: string; name: string; amount_cents: number; source_type: string;
  group_key: string; group_label: string; sort_order: number;
  choice_values: string[]; // which choices this cost funds (empty = whole option, any choice)
}
export interface OptionData {
  id: string; name: string; description: string | null; group_id: string | null;
  option_type: OptionType; choices: OptionChoice[] | null; is_required: boolean;
  max_total: number | null; icon: string | null; depends_on_option_id: string | null;
  allow_none: boolean; none_label: string | null;
  price_cents: number; items: OptItem[];
}
export interface GroupData { id: string; name: string; description: string | null; icon: string | null }

function groupItems(items: OptItem[]): { key: string; label: string; list: OptItem[] }[] {
  const byKey = new Map<string, { label: string; list: OptItem[] }>();
  for (const i of items) {
    const g = byKey.get(i.group_key) || byKey.set(i.group_key, { label: i.group_label, list: [] }).get(i.group_key)!;
    g.list.push(i);
  }
  for (const g of byKey.values()) g.list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  return [...byKey.entries()]
    .sort((a, b) => (a[0].startsWith("contest:") ? 0 : 1) - (b[0].startsWith("contest:") ? 0 : 1) || a[1].label.localeCompare(b[1].label))
    .map(([key, v]) => ({ key, label: v.label, list: v.list }));
}
function dollars(cents: number): string {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;
}
const priceOf = (items: OptItem[]) => items.reduce((s, i) => s + i.amount_cents, 0);

/**
 * What the option header shows. For a plain option it's the sum of bundled costs.
 * For a choice option, cost varies by which choice the member picks, so we show the
 * range across choices: whole-option costs + the costs that fund each choice.
 */
function priceDisplay(o: OptionData): string {
  if (o.option_type === "trip_cost") return dollars(o.price_cents); // derived on Financials
  const whole = o.items.filter((i) => i.choice_values.length === 0).reduce((s, i) => s + i.amount_cents, 0);
  const choiceItems = o.items.filter((i) => i.choice_values.length > 0);
  if (!typeHasChoices(o.option_type) || !o.choices?.length || choiceItems.length === 0) {
    return dollars(whole + choiceItems.reduce((s, i) => s + i.amount_cents, 0));
  }
  const totals = o.choices.map((c) => whole + choiceItems.filter((i) => i.choice_values.includes(c.value)).reduce((s, i) => s + i.amount_cents, 0));
  const min = Math.min(...totals), max = Math.max(...totals);
  return min === max ? dollars(min) : `${dollars(min)}–${dollars(max)}`;
}

type ChoiceDraft = { label: string; value: string };

/** One option as a draggable accordion; header toggles, body = the editor (children). */
function OptionRow({ option, isOpen, onToggle, children }: { option: OptionData; isOpen: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: option.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={styles.cscAcc} data-open={isOpen || undefined}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button type="button" className={styles.finGrab} aria-label="Drag to reorder" {...listeners} {...attributes} style={{ paddingLeft: 12 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" /><circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" /><circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
          </svg>
        </button>
        <button type="button" className={styles.cscAccHead} onClick={onToggle} aria-expanded={isOpen} style={{ flex: 1, paddingLeft: 4 }}>
          <span className={styles.cscAllMain}>
            <span className={styles.cscAllName}>
              {option.icon ? `${option.icon} ` : ""}{option.name}{option.is_required ? " *" : ""}
            </span>
          </span>
          <span className={styles.finRowAmount} style={{ marginRight: 10 }}>{priceDisplay(option)}</span>
          <svg className={styles.cscAccChevron} data-open={isOpen || undefined} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" />
          </svg>
        </button>
      </div>
      {isOpen && <div className={styles.cscAccBody}>{children}</div>}
    </div>
  );
}

/** A draggable, collapsible section; its options render as children. */
const UNGROUPED = "__ungrouped__"; // droppable id for the no-section container

/** Section = a small header (drag handle + title + count + edit/delete), no box. */
function GroupSection({ group, collapsed, count, onToggle, onEdit, onDelete, children }: {
  group: GroupData; collapsed: boolean; count: number; onToggle: () => void; onEdit: () => void; onDelete: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: group.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style}>
      <div className={styles.optSecHead}>
        <button type="button" className={styles.finGrab} aria-label="Drag section" {...listeners} {...attributes}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" /><circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" /><circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
          </svg>
        </button>
        <button type="button" className={styles.optSecTitle} onClick={onToggle} aria-expanded={!collapsed}>
          <svg className={styles.cscAccChevron} data-open={!collapsed || undefined} width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" /></svg>
          <span>{group.icon ? `${group.icon} ` : ""}{group.name}</span>
          <span className={styles.optSectionCount}>{count}</span>
        </button>
        <button type="button" className={styles.sideEditBtn} aria-label="Edit section" onClick={onEdit}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
        </button>
        <button type="button" className={styles.sideEditBtn} aria-label="Delete section" onClick={onDelete}>
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      {!collapsed && children}
    </div>
  );
}

/** Droppable wrapper so a section accepts options dropped anywhere in it (incl. empty). */
function DroppableSection({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return <div ref={setNodeRef} className={styles.optDropZone} data-over={isOver || undefined}>{children}</div>;
}

/** One choice as a draggable accordion: header = label + that choice's cost; body = editor. */
function ChoiceRow({ id, label, cost, isOpen, onToggle, children }: {
  id: string; label: string; cost: string; isOpen: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.6 : 1 };
  return (
    <div ref={setNodeRef} style={style} className={styles.cscAcc} data-open={isOpen || undefined}>
      <div style={{ display: "flex", alignItems: "center" }}>
        <button type="button" className={styles.finGrab} aria-label="Drag choice" {...listeners} {...attributes} style={{ paddingLeft: 12 }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <circle cx="5" cy="3" r="1.4" /><circle cx="11" cy="3" r="1.4" /><circle cx="5" cy="8" r="1.4" /><circle cx="11" cy="8" r="1.4" /><circle cx="5" cy="13" r="1.4" /><circle cx="11" cy="13" r="1.4" />
          </svg>
        </button>
        <button type="button" className={styles.cscAccHead} onClick={onToggle} aria-expanded={isOpen} style={{ flex: 1, paddingLeft: 4 }}>
          <span className={styles.cscAllMain}><span className={styles.cscAllName}>{label}</span></span>
          <span className={styles.finRowAmount} style={{ marginRight: 10 }}>{cost}</span>
          <svg className={styles.cscAccChevron} data-open={isOpen || undefined} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" /></svg>
        </button>
      </div>
      {isOpen && <div className={styles.cscAccBody}>{children}</div>}
    </div>
  );
}

/**
 * Option builder (#218) — full v1 shape. Groups are draggable, collapsible sections;
 * options inside them are draggable accordions that expand to an inline editor (type
 * system + choices + icon + dependency + required + section + cost bundling). Options
 * move between sections via the editor's Section picker.
 */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function OptionsManager({
  slug, orgId, eventId, initialOptions, initialAvailable, initialGroups, initialSettings,
}: {
  slug: string; orgId: string; eventId: string;
  initialOptions: OptionData[]; initialAvailable: OptItem[]; initialGroups: GroupData[];
  initialSettings: OptionSettings;
}) {
  const optionsBase = `/api/v2/orgs/${orgId}/events/${eventId}/options`;
  const groupsBase = `/api/v2/orgs/${orgId}/events/${eventId}/option-groups`;
  const costBase = `/api/v2/orgs/${orgId}/events/${eventId}/cost-items`;
  const settingsBase = `/api/v2/orgs/${orgId}/events/${eventId}/option-settings`;
  void slug;

  const [settings, setSettings] = useState<OptionSettings>(initialSettings);

  const [options, setOptions] = useState<OptionData[]>(initialOptions);
  const [groups, setGroups] = useState<GroupData[]>(initialGroups);
  const [available, setAvailable] = useState<OptItem[]>(initialAvailable);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [openId, setOpenId] = useState<string | null>(null); // option id | "new" | null
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [addingTo, setAddingTo] = useState<OptionData | null>(null);
  const [confirmDel, setConfirmDel] = useState<OptionData | null>(null);
  const [openChoice, setOpenChoice] = useState<string | null>(null); // `${optionId}:${choiceValue}`
  const [costModalFor, setCostModalFor] = useState<{ oId: string; cv: string } | null>(null);

  // Option editor form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [optType, setOptType] = useState<OptionType>("checkbox");
  const [choices, setChoices] = useState<ChoiceDraft[]>([]);
  const [maxTotal, setMaxTotal] = useState("");
  const [allowNone, setAllowNone] = useState(false);
  const [noneLabel, setNoneLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [isRequired, setIsRequired] = useState(false);
  const [dependsOn, setDependsOn] = useState("");
  const [groupId, setGroupId] = useState("");
  const [iconOpen, setIconOpen] = useState(false);

  // Group editor
  const [groupModal, setGroupModal] = useState(false);
  const [editingGroup, setEditingGroup] = useState<GroupData | null>(null);
  const [gName, setGName] = useState("");
  const [gIcon, setGIcon] = useState("");
  const [gDesc, setGDesc] = useState("");
  const [gIconOpen, setGIconOpen] = useState(false);
  const [confirmDelGroup, setConfirmDelGroup] = useState<GroupData | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  const knownGroupIds = new Set(groups.map((g) => g.id));
  const containerGid = (o: OptionData): string | null => (o.group_id && knownGroupIds.has(o.group_id) ? o.group_id : null);
  const optsOf = (gid: string | null) => options.filter((o) => containerGid(o) === gid);
  const ungrouped = optsOf(null);

  // ── Option editor ──────────────────────────────────────────────────────────
  function loadForm(o: OptionData) {
    setName(o.name); setDescription(o.description || ""); setOptType(o.option_type);
    setChoices((o.choices || []).map((c) => ({ label: c.label, value: c.value })));
    setMaxTotal(o.max_total != null ? String(o.max_total) : ""); setIcon(o.icon || "");
    setAllowNone(!!o.allow_none); setNoneLabel(o.none_label || "");
    setIsRequired(o.is_required); setDependsOn(o.depends_on_option_id || ""); setGroupId(o.group_id || ""); setIconOpen(false);
  }
  function toggleOpen(o: OptionData) {
    setError(null);
    if (openId === o.id) { setOpenId(null); return; }
    loadForm(o); setOpenId(o.id);
  }
  function openNew(gid: string | null) {
    setError(null);
    setName(""); setDescription(""); setOptType("checkbox"); setChoices([]); setMaxTotal("");
    setAllowNone(false); setNoneLabel("");
    setIcon(""); setIsRequired(false); setDependsOn(""); setGroupId(gid || ""); setIconOpen(false);
    setOpenId("new");
  }
  // Changing an EXISTING option's type persists immediately, so the type-specific UI
  // (choices + per-choice costs below) appears right away without a manual save.
  async function changeType(forOption: OptionData | null, next: OptionType) {
    setOptType(next);
    // Yes/no (checkbox) can't be required — clear it so a switched option doesn't nag forever.
    if (next === "checkbox") setIsRequired(false);
    if (!forOption || busy) return;
    setBusy(true); setError(null);
    const before = options;
    try {
      const patch: Record<string, unknown> = { option_type: next };
      if (next === "checkbox") patch.is_required = false;
      const res = await fetch(`${optionsBase}/${forOption.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error();
      const saved = (await res.json()).option as OptionData;
      setOptions((prev) => prev.map((x) => (x.id === forOption.id ? { ...x, option_type: saved.option_type, choices: saved.choices, is_required: saved.is_required } : x)));
    } catch { setOptions(before); setOptType(forOption.option_type); setError("Could not change type"); }
    finally { setBusy(false); }
  }
  const addChoice = () => setChoices((c) => [...c, { label: "", value: "" }]);
  const updateChoice = (i: number, label: string) => setChoices((c) => c.map((x, j) => (j === i ? { ...x, label } : x)));
  const removeChoice = (i: number) => setChoices((c) => c.filter((_, j) => j !== i));
  const moveChoice = (i: number, d: -1 | 1) => setChoices((c) => { const j = i + d; if (j < 0 || j >= c.length) return c; const n = [...c]; [n[i], n[j]] = [n[j], n[i]]; return n; });

  async function submitOption(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!name.trim()) { setError("Name is required"); return; }
    setBusy(true); setError(null);
    const isNew = openId === "new";
    const payload: Record<string, unknown> = {
      name: name.trim(), description, option_type: optType, group_id: groupId || null,
      is_required: optType === "checkbox" ? false : isRequired, max_total: optType === "quantity" && maxTotal.trim() ? Number(maxTotal) : null,
      icon: icon || null, depends_on_option_id: dependsOn || null,
      // The "none" opt-out is a quantity-only affordance.
      allow_none: optType === "quantity" ? allowNone : false,
      none_label: optType === "quantity" && allowNone ? (noneLabel.trim() || null) : null,
    };
    // Choices are set at creation; for existing options they're managed in the
    // per-choice accordions, so don't let a stale draft overwrite them here.
    if (isNew && typeHasChoices(optType)) payload.choices = choices.filter((c) => c.label.trim()).map((c) => ({ label: c.label.trim(), value: c.value }));
    try {
      const res = isNew
        ? await fetch(optionsBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(`${optionsBase}/${openId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
      const { option } = await res.json();
      const mapped = (prev?: OptionData): OptionData => ({
        id: option.id, name: option.name, description: option.description, group_id: option.group_id,
        option_type: option.option_type, choices: option.choices, is_required: option.is_required, max_total: option.max_total,
        icon: option.icon, depends_on_option_id: option.depends_on_option_id,
        allow_none: option.allow_none, none_label: option.none_label,
        price_cents: prev?.price_cents ?? 0, items: prev?.items ?? [],
      });
      if (isNew) { setOptions((prev) => [...prev, mapped()]); setOpenId(option.id); }
      else setOptions((prev) => prev.map((o) => (o.id === openId ? mapped(o) : o)));
    } finally { setBusy(false); }
  }

  async function deleteOption(o: OptionData) {
    setBusy(true);
    try {
      const res = await fetch(`${optionsBase}/${o.id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not delete"); return; }
      setAvailable((prev) => [...prev, ...o.items].sort((a, b) => a.name.localeCompare(b.name)));
      setOptions((prev) => prev.filter((x) => x.id !== o.id));
      if (openId === o.id) setOpenId(null);
      setConfirmDel(null);
    } finally { setBusy(false); }
  }

  // Which container (group id or UNGROUPED) a draggable id belongs to. The id may be an
  // option id, a group id (header/droppable), or the ungrouped droppable sentinel.
  function containerOf(id: string): string {
    if (id === UNGROUPED) return UNGROUPED;
    if (knownGroupIds.has(id)) return id;
    const o = options.find((x) => x.id === id);
    return o ? (containerGid(o) ?? UNGROUPED) : UNGROUPED;
  }

  // Persist new per-section ordering (+ group reassignment). Optimistic; reverts on error.
  async function commitSections(updated: Array<{ gid: string | null; list: OptionData[] }>) {
    const changedGids = new Set(updated.map((s) => s.gid));
    const untouched = options.filter((o) => !changedGids.has(containerGid(o)));
    const changed = updated.flatMap((s) => s.list.map((o) => ({ ...o, group_id: s.gid })));
    const before = options;
    setOptions([...untouched, ...changed]);
    try {
      await Promise.all(updated.flatMap((s) => s.list.map((o, i) =>
        fetch(`${optionsBase}/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: i, group_id: s.gid }) })
          .then((r) => { if (!r.ok) throw new Error(); }))));
      setError(null);
    } catch { setOptions(before); setError("Could not save the new order"); }
  }

  // Drag an option within or between sections (ungrouped + Trip Cost included).
  async function moveOption(activeId: string, overId: string) {
    const from = containerOf(activeId);
    const to = containerOf(overId);
    const fromGid = from === UNGROUPED ? null : from;
    const toGid = to === UNGROUPED ? null : to;
    const fromList = optsOf(fromGid);
    const moved = fromList.find((o) => o.id === activeId);
    if (!moved) return;

    if (from === to) {
      const oldIdx = fromList.findIndex((o) => o.id === activeId);
      const newIdx = overId === to ? fromList.length - 1 : fromList.findIndex((o) => o.id === overId);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      await commitSections([{ gid: fromGid, list: arrayMove(fromList, oldIdx, newIdx) }]);
    } else {
      const toList = optsOf(toGid);
      const newFrom = fromList.filter((o) => o.id !== activeId);
      const at = overId === to ? toList.length : toList.findIndex((o) => o.id === overId);
      const insertIdx = at < 0 ? toList.length : at;
      const newTo = [...toList.slice(0, insertIdx), moved, ...toList.slice(insertIdx)];
      await commitSections([{ gid: fromGid, list: newFrom }, { gid: toGid, list: newTo }]);
    }
  }

  // One handler for the single DndContext: a group id → reorder sections; else move an option.
  async function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over) return;
    const activeId = String(active.id), overId = String(over.id);
    if (activeId === overId) return;
    if (knownGroupIds.has(activeId)) { await reorderGroups(e); return; }
    await moveOption(activeId, overId);
  }

  // ── Groups ───────────────────────────────────────────────────────────────
  function openGroupCreate() { setEditingGroup(null); setGName(""); setGIcon(""); setGDesc(""); setGIconOpen(false); setError(null); setGroupModal(true); }
  function openGroupEdit(g: GroupData) { setEditingGroup(g); setGName(g.name); setGIcon(g.icon || ""); setGDesc(g.description || ""); setGIconOpen(false); setError(null); setGroupModal(true); }

  async function submitGroup(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!gName.trim()) { setError("Name is required"); return; }
    setBusy(true); setError(null);
    const payload = { name: gName.trim(), description: gDesc, icon: gIcon || null };
    try {
      const res = editingGroup
        ? await fetch(`${groupsBase}/${editingGroup.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) })
        : await fetch(groupsBase, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
      const { group } = await res.json();
      const g: GroupData = { id: group.id, name: group.name, description: group.description, icon: group.icon };
      setGroups((prev) => (editingGroup ? prev.map((x) => (x.id === g.id ? g : x)) : [...prev, g]));
      setGroupModal(false);
    } finally { setBusy(false); }
  }

  async function deleteGroup(g: GroupData) {
    setBusy(true);
    try {
      const res = await fetch(`${groupsBase}/${g.id}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not delete"); return; }
      setGroups((prev) => prev.filter((x) => x.id !== g.id));
      setOptions((prev) => prev.map((o) => (o.group_id === g.id ? { ...o, group_id: null } : o))); // fall to ungrouped
      setConfirmDelGroup(null);
    } finally { setBusy(false); }
  }

  async function reorderGroups(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = groups.findIndex((g) => g.id === active.id);
    const newIdx = groups.findIndex((g) => g.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(groups, oldIdx, newIdx);
    const before = groups;
    setGroups(reordered);
    try {
      await Promise.all(reordered.map((g, i) =>
        fetch(`${groupsBase}/${g.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sort_order: i }) })
          .then((r) => { if (!r.ok) throw new Error(); })));
      setError(null);
    } catch { setGroups(before); setError("Could not save the section order"); }
  }

  // ── Cost bundling ─────────────────────────────────────────────────────────
  async function setItemOption(item: OptItem, optionId: string | null, choiceValues?: string[]) {
    const body: Record<string, unknown> = { linked_option_id: optionId };
    if (choiceValues !== undefined) body.choice_values = choiceValues;
    const res = await fetch(`${costBase}/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not update"); return false; }
    return true;
  }
  // Non-choice options: add a cost to the bundle (always whole-option).
  async function linkItem(option: OptionData, item: OptItem) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (!(await setItemOption(item, option.id, []))) return;
      const placed: OptItem = { ...item, choice_values: [] };
      setAvailable((prev) => prev.filter((i) => i.id !== item.id));
      setOptions((prev) => prev.map((o) => (o.id === option.id ? { ...o, items: [...o.items, placed], price_cents: priceOf([...o.items, placed]) } : o)));
    } finally { setBusy(false); }
  }
  async function unlinkItem(option: OptionData, item: OptItem) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      if (!(await setItemOption(item, null))) return;
      setOptions((prev) => prev.map((o) => { if (o.id !== option.id) return o; const items = o.items.filter((i) => i.id !== item.id); return { ...o, items, price_cents: priceOf(items) }; }));
      setAvailable((prev) => [...prev, { ...item, choice_values: [] }].sort((a, b) => a.name.localeCompare(b.name)));
    } finally { setBusy(false); }
  }

  // ── Choice options: per-choice funding matrix ─────────────────────────────
  // Which choices a candidate currently funds. A cost bundled here with no explicit
  // choices (legacy whole-option) counts as every choice.
  function effectiveChoices(o: OptionData, item: OptItem): string[] {
    const bundled = o.items.find((i) => i.id === item.id);
    if (!bundled) return [];
    return bundled.choice_values.length ? bundled.choice_values : (o.choices || []).map((c) => c.value);
  }
  // Persist a cost's funded-choice set. Empty set → unlink it from the option (it
  // returns to the available pool but stays visible in the matrix). Non-empty → link.
  async function applyItemChoices(o: OptionData, item: OptItem, next: string[]) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const wasBundled = o.items.some((i) => i.id === item.id);
      if (next.length === 0) {
        if (!(await setItemOption(item, null))) return;
        setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, items: x.items.filter((i) => i.id !== item.id), price_cents: priceOf(x.items.filter((i) => i.id !== item.id)) } : x)));
        setAvailable((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, { ...item, choice_values: [] }].sort((a, b) => a.name.localeCompare(b.name))));
      } else {
        if (!(await setItemOption(item, o.id, next))) return;
        if (wasBundled) {
          setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, items: x.items.map((i) => (i.id === item.id ? { ...i, choice_values: next } : i)) } : x)));
        } else {
          const placed: OptItem = { ...item, choice_values: next };
          setAvailable((prev) => prev.filter((i) => i.id !== item.id));
          setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, items: [...x.items, placed], price_cents: priceOf([...x.items, placed]) } : x)));
        }
      }
    } finally { setBusy(false); }
  }
  const choiceHasCost = (o: OptionData, item: OptItem, cv: string): boolean => effectiveChoices(o, item).includes(cv);
  // Every cost assignable to an option (bundled anywhere + unassigned) — the picker
  // shows them all, so a cost used elsewhere is still visible (and can be moved here).
  const allAssignableItems = (): OptItem[] => [...options.flatMap((x) => x.items), ...available];

  // Turn a cost on/off for one choice from the picker modal. Costs can live on any
  // option (one option each), so turning one on MOVES it to this option if needed.
  async function setCostOnChoice(o: OptionData, item: OptItem, cv: string, turnOn: boolean) {
    if (busy) return;
    const inThis = o.items.find((i) => i.id === item.id);
    const currentCv = inThis ? (inThis.choice_values.length ? inThis.choice_values : (o.choices || []).map((c) => c.value)) : [];
    const next = turnOn
      ? (inThis ? Array.from(new Set([...currentCv, cv])) : [cv])
      : currentCv.filter((v) => v !== cv);
    setBusy(true); setError(null);
    try {
      if (next.length === 0) {
        if (!(await setItemOption(item, null))) return;
        setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, items: x.items.filter((i) => i.id !== item.id), price_cents: priceOf(x.items.filter((i) => i.id !== item.id)) } : x)));
        setAvailable((prev) => (prev.some((i) => i.id === item.id) ? prev : [...prev, { ...item, choice_values: [] }].sort((a, b) => a.name.localeCompare(b.name))));
      } else {
        if (!(await setItemOption(item, o.id, next))) return;
        const placed: OptItem = { ...item, choice_values: next };
        setAvailable((prev) => prev.filter((i) => i.id !== item.id));
        setOptions((prev) => prev.map((x) => {
          if (x.id === o.id) {
            const items = x.items.some((i) => i.id === item.id) ? x.items.map((i) => (i.id === item.id ? placed : i)) : [...x.items, placed];
            return { ...x, items, price_cents: priceOf(items) };
          }
          // Strip it from whatever other option it used to belong to.
          if (x.items.some((i) => i.id === item.id)) { const items = x.items.filter((i) => i.id !== item.id); return { ...x, items, price_cents: priceOf(items) }; }
          return x;
        }));
      }
    } finally { setBusy(false); }
  }

  // ── Choices (immediate-save: label, order, add, remove) ───────────────────
  // What one choice costs: whole-option costs + the costs that fund this choice.
  const choiceCost = (o: OptionData, cv: string): number =>
    o.items.reduce((s, i) => ((i.choice_values.length === 0 || i.choice_values.includes(cv)) ? s + i.amount_cents : s), 0);

  async function patchChoices(o: OptionData, next: OptionChoice[]) {
    if (busy) return;
    setBusy(true); setError(null);
    const before = options;
    setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, choices: next } : x)));
    try {
      const res = await fetch(`${optionsBase}/${o.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ choices: next }) });
      if (!res.ok) throw new Error();
      const saved = (await res.json()).option as { choices: OptionChoice[] | null };
      setOptions((prev) => prev.map((x) => (x.id === o.id ? { ...x, choices: saved.choices } : x)));
      setError(null);
    } catch { setOptions(before); setError("Could not save choices"); }
    finally { setBusy(false); }
  }
  async function addChoiceTo(o: OptionData) {
    const existing = new Set((o.choices || []).map((c) => c.value));
    let n = (o.choices?.length || 0) + 1;
    let value = `choice_${n}`;
    while (existing.has(value)) { n += 1; value = `choice_${n}`; }
    await patchChoices(o, [...(o.choices || []), { label: `New choice ${(o.choices?.length || 0) + 1}`, value, cost: null, contest_id: null }]);
    setOpenChoice(`${o.id}:${value}`);
  }
  async function renameChoice(o: OptionData, value: string, label: string) {
    await patchChoices(o, (o.choices || []).map((c) => (c.value === value ? { ...c, label } : c)));
  }
  async function removeChoiceFrom(o: OptionData, value: string) {
    // Strip this choice from any cost that funds it first (unlinks a cost that funded only it).
    for (const it of o.items.filter((i) => i.choice_values.includes(value))) {
      await applyItemChoices(o, it, it.choice_values.filter((v) => v !== value));
    }
    await patchChoices(o, (o.choices || []).filter((c) => c.value !== value));
    setOpenChoice(null);
  }
  async function reorderChoices(o: OptionData, e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const list = o.choices || [];
    const oldIdx = list.findIndex((c) => c.value === active.id);
    const newIdx = list.findIndex((c) => c.value === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    await patchChoices(o, arrayMove(list, oldIdx, newIdx));
  }

  async function patchSettings(patch: Partial<OptionSettings>) {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(settingsBase, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
      setSettings((await res.json()).settings);
    } finally { setBusy(false); }
  }

  const addingToLive = addingTo ? options.find((o) => o.id === addingTo.id) || null : null;
  const availableGroups = groupItems(available);

  // ── Renderers ─────────────────────────────────────────────────────────────
  function editorForm(forOption: OptionData | null) {
    return (
      <form className={styles.form} onSubmit={submitOption}>
        <div className={styles.field}>
          <label className={styles.label}>Name</label>
          <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Closest to the Pin" maxLength={120} autoFocus />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Type</label>
          <select className={styles.selectInput} value={optType} disabled={busy} onChange={(e) => changeType(forOption, e.target.value as OptionType)}>
            {OPTION_TYPES.filter((t) => t.type !== "trip_cost").map((t) => <option key={t.type} value={t.type}>{t.label}</option>)}
          </select>
        </div>
        {/* New options define their choices here; existing options manage choices (and
            per-choice costs) in the draggable accordions below the form. */}
        {typeHasChoices(optType) && !forOption && (
          <div className={styles.field}>
            <label className={styles.label}>Choices</label>
            {choices.map((c, i) => (
              <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => moveChoice(i, -1)} disabled={i === 0} aria-label="Move up"><span className={styles.stepGlyph}>▲</span></button>
                  <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => moveChoice(i, 1)} disabled={i === choices.length - 1} aria-label="Move down"><span className={styles.stepGlyph}>▼</span></button>
                </div>
                <input className={styles.input} value={c.label} placeholder={`Choice ${i + 1}`} maxLength={80} onChange={(e) => updateChoice(i, e.target.value)} />
                <button type="button" className={styles.removeBtn} onClick={() => removeChoice(i)}>Remove</button>
              </div>
            ))}
            <button type="button" className={styles.createBtnGhost} onClick={addChoice}>+ Add choice</button>
            <p className={styles.roundFormHint} style={{ marginTop: 6 }}>Save the option, then open each choice to assign its costs.</p>
          </div>
        )}
        {optType === "quantity" && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Max total per member <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} inputMode="numeric" value={maxTotal} onChange={(e) => setMaxTotal(e.target.value.replace(/[^0-9]/g, ""))} placeholder="No limit" />
            </div>
            <label className={styles.profileToggle}>
              <input type="checkbox" checked={allowNone} onChange={(e) => setAllowNone(e.target.checked)} />
              <span>Offer a &ldquo;No, thank you&rdquo; option</span>
            </label>
            {allowNone && (
              <div className={styles.field}>
                <label className={styles.label}>Opt-out label <span className={styles.optional}>(optional)</span></label>
                <input className={styles.input} value={noneLabel} maxLength={80} placeholder="No, thank you" onChange={(e) => setNoneLabel(e.target.value)} />
              </div>
            )}
          </>
        )}
        <div className={styles.field}>
          <label className={styles.label}>Description <span className={styles.optional}>(optional)</span></label>
          <textarea className={styles.textarea} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What members are opting into" maxLength={300} />
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Section <span className={styles.optional}>(optional)</span></label>
          <select className={styles.selectInput} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Ungrouped</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Icon <span className={styles.optional}>(optional)</span></label>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button type="button" className={styles.createBtnGhost} onClick={() => setIconOpen((v) => !v)}>{icon ? `${icon}  Change` : "Choose icon"}</button>
            {icon && <button type="button" className={styles.removeBtn} onClick={() => setIcon("")}>Clear</button>}
          </div>
          {iconOpen && (
            <div className={styles.iconGrid}>
              {OPTION_ICON_CATEGORIES.map((cat) => (
                <div key={cat.category}>
                  <p className={styles.iconGridCat}>{cat.category}</p>
                  <div className={styles.iconGridRow}>
                    {cat.icons.map((em) => <button key={em} type="button" className={styles.iconBtn} data-on={icon === em || undefined} onClick={() => { setIcon(em); setIconOpen(false); }}>{em}</button>)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className={styles.field}>
          <label className={styles.label}>Depends on <span className={styles.optional}>(optional)</span></label>
          <select className={styles.selectInput} value={dependsOn} onChange={(e) => setDependsOn(e.target.value)}>
            <option value="">None (always shown)</option>
            {options.filter((o) => o.id !== forOption?.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        {/* A yes/no switch only has an "on" action, so "no" = no action = looks unanswered.
            Required can't be satisfied by "no", so it isn't offered for checkbox. */}
        {optType === "checkbox" ? (
          <p className={styles.roundFormHint}>Yes/no options can&apos;t be required, choose &ldquo;Select one&rdquo; if an answer is mandatory.</p>
        ) : (
          <label className={styles.profileToggle}>
            <input type="checkbox" checked={isRequired} onChange={(e) => setIsRequired(e.target.checked)} />
            <span>Required</span>
          </label>
        )}
        {error && <p className={styles.formError}>{error}</p>}
        <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
          {busy ? "Saving…" : forOption ? "Save option" : "Add option"}
        </button>
      </form>
    );
  }

  function costSection(o: OptionData) {
    const hasChoices = typeHasChoices(o.option_type);

    // Choice options: each choice is a draggable accordion. Open one to pick which
    // costs apply to it; its header shows that choice's total. A cost can apply to
    // several choices (e.g. a Monday hotel night on every "arrive Monday" choice).
    if (hasChoices) {
      const choices = o.choices || [];
      return (
        <div style={{ marginTop: 16 }}>
          <p className={styles.sectionLabel}>Choices</p>
          <p className={styles.roundFormHint} style={{ marginTop: -2, marginBottom: 8 }}>
            Add the choices members pick from. Open a choice to pick which costs apply to it; drag to reorder.
          </p>
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={(e) => reorderChoices(o, e)}>
            <SortableContext items={choices.map((c) => c.value)} strategy={verticalListSortingStrategy}>
              <div className={styles.cscAllList} style={{ gap: 8 }}>
                {choices.map((c) => {
                  const key = `${o.id}:${c.value}`;
                  const applied = o.items.filter((it) => choiceHasCost(o, it, c.value));
                  return (
                    <ChoiceRow key={c.value} id={c.value} label={c.label} cost={dollars(choiceCost(o, c.value))}
                      isOpen={openChoice === key} onToggle={() => setOpenChoice((cur) => (cur === key ? null : key))}>
                      <div className={styles.field} style={{ marginBottom: 10 }}>
                        <label className={styles.label}>Label</label>
                        <input className={styles.input} defaultValue={c.label} maxLength={80} disabled={busy}
                          onBlur={(e) => { const t = e.target.value.trim(); if (t && t !== c.label) renameChoice(o, c.value, t); else e.target.value = c.label; }} />
                      </div>
                      <p className={styles.sectionLabel} style={{ marginTop: 0 }}>Costs</p>
                      {applied.length === 0 ? (
                        <p className={styles.dnsHint} style={{ marginTop: 4 }}>No costs on this choice yet.</p>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                          {applied.map((it) => <span key={it.id} className={styles.roleBadge}>{it.name} {dollars(it.amount_cents)}</span>)}
                        </div>
                      )}
                      <button type="button" className={styles.createBtnGhost} style={{ marginTop: 8 }} disabled={busy}
                        onClick={() => setCostModalFor({ oId: o.id, cv: c.value })}>Choose costs</button>
                      <div style={{ marginTop: 14 }}>
                        <button type="button" className={styles.removeBtn} onClick={() => removeChoiceFrom(o, c.value)} disabled={busy}>Remove choice</button>
                      </div>
                    </ChoiceRow>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          <button type="button" className={styles.createBtnGhost} onClick={() => addChoiceTo(o)} disabled={busy} style={{ marginTop: 10 }}>+ Add choice</button>
          <div style={{ marginTop: 14 }}>
            <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDel(o)} disabled={busy}>Delete option</button>
          </div>
        </div>
      );
    }

    // Non-choice options: a plain bundle (each cost is in or out).
    return (
      <div style={{ marginTop: 16 }}>
        <p className={styles.sectionLabel}>Bundled costs</p>
        {o.items.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 4 }}>No costs bundled. A $0 option is a free opt-in.</p>
        ) : (
          <div className={styles.memberList} style={{ marginTop: 4 }}>
            {o.items.map((it) => (
              <div key={it.id} className={styles.finRow}>
                <div className={styles.finRowMain} style={{ minWidth: 0 }}>
                  <span className={styles.finRowName}>{it.name}</span>
                </div>
                <span className={styles.finRowAmount}>{dollars(it.amount_cents)}</span>
                <button type="button" className={styles.removeBtn} onClick={() => unlinkItem(o, it)} disabled={busy} style={{ marginLeft: 8 }}>Remove</button>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button type="button" className={styles.createBtnGhost} onClick={() => setAddingTo(o)} disabled={available.length === 0}>Add cost{available.length === 0 ? " (none free)" : ""}</button>
          <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDel(o)} disabled={busy}>Delete option</button>
        </div>
      </div>
    );
  }

  // Trip Cost's locked body — it's derived + unremovable, so no editor/cost picker.
  function tripCostBody() {
    return (
      <div className={styles.cscAccBody}>
        <p className={styles.roundFormHint} style={{ marginTop: 0 }}>
          Price is set on the Financials screen (the sum of everything marked Trip Cost). New options depend on this by default, and it can&apos;t be removed. Drag it into any section.
        </p>
      </div>
    );
  }

  function optionList(gid: string | null) {
    const list = optsOf(gid);
    return (
      <DroppableSection id={gid ?? UNGROUPED}>
        <SortableContext items={list.map((o) => o.id)} strategy={verticalListSortingStrategy}>
          <div className={styles.cscAllList} style={{ gap: 8 }}>
            {list.map((o) => (
              <OptionRow key={o.id} option={o} isOpen={openId === o.id} onToggle={() => toggleOpen(o)}>
                {o.option_type === "trip_cost" ? tripCostBody() : (<>{editorForm(o)}{costSection(o)}</>)}
              </OptionRow>
            ))}
          </div>
        </SortableContext>
        {list.length === 0 && <p className={styles.dnsHint} style={{ marginTop: 6 }}>Drop an option here, or add one.</p>}
        <button type="button" className={styles.createBtnGhost} onClick={() => openNew(gid)} style={{ marginTop: 10 }}>+ Add option</button>
      </DroppableSection>
    );
  }

  return (
    <div>
      {error && <p className={styles.formError} style={{ marginTop: 12 }}>{error}</p>}

      {/* Selection close — the read-only cutoff. Whether Options is visible, when it
          opens, and the "it's open" notification all live in Features now (#218);
          only this Options-specific "visible but frozen" deadline stays here. */}
      <div className={styles.cscAcc} style={{ marginTop: 14 }}>
        <div className={styles.cscAccBody} style={{ paddingTop: 12 }}>
          <div className={styles.field} style={{ marginBottom: 0 }}>
            <label className={styles.label}>Selections close <span className={styles.optional}>(optional)</span></label>
            <input type="datetime-local" className={styles.input} value={toLocalInput(settings.selection_deadline)} disabled={busy}
              onChange={(e) => patchSettings({ selection_deadline: e.target.value ? new Date(e.target.value).toISOString() : null })} />
            <p className={styles.roundFormHint}>After this, the Options page stays visible but members can no longer change their picks. Whether Options is visible and when it opens are set in Features.</p>
          </div>
        </div>
      </div>

      <div className={styles.titleRow} style={{ marginTop: 18 }}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Options ({options.length})</p>
        <button type="button" className={styles.createBtnGhost} onClick={openGroupCreate}>+ Add section</button>
      </div>

      {/* One DndContext for everything: drag section headers to reorder sections, and
          drag option rows (incl. Trip Cost) within or between sections. */}
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <SortableContext items={groups.map((g) => g.id)} strategy={verticalListSortingStrategy}>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 12 }}>
            {groups.map((g) => (
              <GroupSection key={g.id} group={g} collapsed={collapsed.has(g.id)} count={optsOf(g.id).length}
                onToggle={() => setCollapsed((prev) => { const n = new Set(prev); if (n.has(g.id)) n.delete(g.id); else n.add(g.id); return n; })}
                onEdit={() => openGroupEdit(g)} onDelete={() => setConfirmDelGroup(g)}>
                {optionList(g.id)}
              </GroupSection>
            ))}
          </div>
        </SortableContext>

        {/* Ungrouped — no outer box, full width. With sections present it gets a small
            header; with none, the "Options" title row above already labels it. */}
        <div style={{ marginTop: groups.length > 0 ? 18 : 12 }}>
          {groups.length > 0 && (
            <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>
              Ungrouped <span className={styles.optSectionCount} style={{ marginLeft: 6 }}>{ungrouped.length}</span>
            </p>
          )}
          {optionList(null)}
        </div>
      </DndContext>

      {/* New-option draft */}
      {openId === "new" && (
        <div className={styles.cscAcc} data-open style={{ marginTop: 14 }}>
          <div className={styles.cscAccHead} style={{ cursor: "default" }}><span className={styles.cscAllName}>New option</span></div>
          <div className={styles.cscAccBody}>
            {editorForm(null)}
            <button type="button" className={styles.createBtnGhost} onClick={() => setOpenId(null)} style={{ marginTop: 10 }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Unbundled costs */}
      {available.length > 0 && (
        <div className={styles.section} style={{ marginTop: 22 }}>
          <p className={styles.sectionLabel}>Not in Trip Cost, not in an option ({available.length})</p>
          <p className={styles.roundFormHint} style={{ marginTop: -2, marginBottom: 8 }}>These costs aren&apos;t charged to anyone yet. Bundle each into an option (or mark it Trip Cost on the Financials screen).</p>
          <div className={styles.finGroups}>
            {availableGroups.map((g) => (
              <div key={g.key} className={styles.finGroup}>
                <p className={styles.finGroupHead}>{g.label}</p>
                <div className={styles.memberList}>
                  {g.list.map((it) => (
                    <div key={it.id} className={styles.finRow}><div className={styles.finRowMain}><span className={styles.finRowName}>{it.name}</span></div><span className={styles.finRowAmount}>{dollars(it.amount_cents)}</span></div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add a cost to a non-choice option (choice options use the inline matrix) */}
      <Modal open={!!addingTo} title={addingTo ? `Add costs to ${addingTo.name}` : ""} onClose={() => (busy ? undefined : setAddingTo(null))}>
        {available.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>Nothing available. Create a contest with a buy-in, or add a manual cost on the Financials screen first.</p>
        ) : (
          <div className={styles.finGroups}>
            {availableGroups.map((g) => (
              <div key={g.key} className={styles.finGroup}>
                <p className={styles.finGroupHead}>{g.label}</p>
                <div className={styles.memberList}>
                  {g.list.map((it) => (
                    <button key={it.id} type="button" className={styles.memberRowBtn} disabled={busy} onClick={() => addingToLive && linkItem(addingToLive, it)}>
                      <div className={styles.memberMeta} style={{ minWidth: 0 }}><div className={styles.memberName}>{it.name}</div></div>
                      <span className={styles.finRowAmount}>{dollars(it.amount_cents)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Per-choice cost picker — every assignable cost, categorized + sort-ordered. */}
      {(() => {
        const o = costModalFor ? options.find((x) => x.id === costModalFor.oId) || null : null;
        const choice = o?.choices?.find((c) => c.value === costModalFor?.cv) || null;
        const groups = o && choice ? groupItems(allAssignableItems()) : [];
        return (
          <Modal open={!!o && !!choice} title={choice ? `Costs for ${choice.label}` : ""} onClose={() => (busy ? undefined : setCostModalFor(null))}>
            {!o || !choice ? null : groups.length === 0 ? (
              <p className={styles.dnsHint} style={{ marginTop: 0 }}>No costs yet. Create a contest with a buy-in, or add a manual cost on the Financials screen first.</p>
            ) : (
              <>
                <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Tap a cost to apply it to this choice. A cost can be on several choices; moving one here takes it off whatever option it was on before.</p>
                <div className={styles.finGroups}>
                  {groups.map((g) => (
                    <div key={g.key} className={styles.finGroup}>
                      <p className={styles.finGroupHead}>{g.label}</p>
                      <div className={styles.memberList}>
                        {g.list.map((it) => {
                          const on = choiceHasCost(o, it, choice.value);
                          return (
                            <button key={it.id} type="button" className={styles.memberRowBtn} data-on={on || undefined} disabled={busy}
                              onClick={() => setCostOnChoice(o, it, choice.value, !on)}>
                              <span style={{ display: "inline-flex", width: 22, flex: "none", color: on ? "var(--brand)" : "var(--ink-soft)" }}>
                                {on ? (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
                                ) : (
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><circle cx="12" cy="12" r="9" /></svg>
                                )}
                              </span>
                              <div className={styles.memberMeta} style={{ minWidth: 0, flex: 1 }}><div className={styles.memberName}>{it.name}</div></div>
                              <span className={styles.finRowAmount}>{dollars(it.amount_cents)}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </Modal>
        );
      })()}

      {/* Group create / edit */}
      <Modal open={groupModal} title={editingGroup ? "Edit section" : "Add section"} onClose={() => (busy ? undefined : setGroupModal(false))}>
        <form className={styles.form} onSubmit={submitGroup}>
          <div className={styles.field}>
            <label className={styles.label}>Name</label>
            <input className={styles.input} value={gName} onChange={(e) => setGName(e.target.value)} placeholder="e.g. Contest entry fees" maxLength={100} autoFocus />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Description <span className={styles.optional}>(optional)</span></label>
            <textarea className={styles.textarea} value={gDesc} onChange={(e) => setGDesc(e.target.value)} maxLength={300} />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Icon <span className={styles.optional}>(optional)</span></label>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className={styles.createBtnGhost} onClick={() => setGIconOpen((v) => !v)}>{gIcon ? `${gIcon}  Change` : "Choose icon"}</button>
              {gIcon && <button type="button" className={styles.removeBtn} onClick={() => setGIcon("")}>Clear</button>}
            </div>
            {gIconOpen && (
              <div className={styles.iconGrid}>
                {OPTION_ICON_CATEGORIES.map((cat) => (
                  <div key={cat.category}>
                    <p className={styles.iconGridCat}>{cat.category}</p>
                    <div className={styles.iconGridRow}>
                      {cat.icons.map((em) => <button key={em} type="button" className={styles.iconBtn} data-on={gIcon === em || undefined} onClick={() => { setGIcon(em); setGIconOpen(false); }}>{em}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {error && <p className={styles.formError}>{error}</p>}
          <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : editingGroup ? "Save section" : "Add section"}</button>
        </form>
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        destructive
        title="Delete option?"
        message={confirmDel ? `Remove "${confirmDel.name}"? Its ${confirmDel.items.length} bundled cost${confirmDel.items.length === 1 ? "" : "s"} go back to unassigned, and any member selections are cleared.` : ""}
        confirmLabel="Delete"
        onConfirm={() => confirmDel && deleteOption(confirmDel)}
        onCancel={() => (busy ? undefined : setConfirmDel(null))}
      />
      <ConfirmModal
        open={!!confirmDelGroup}
        destructive
        title="Delete section?"
        message={confirmDelGroup ? `Remove "${confirmDelGroup.name}"? Its options move to Ungrouped (they aren't deleted).` : ""}
        confirmLabel="Delete section"
        onConfirm={() => confirmDelGroup && deleteGroup(confirmDelGroup)}
        onCancel={() => (busy ? undefined : setConfirmDelGroup(null))}
      />
    </div>
  );
}
