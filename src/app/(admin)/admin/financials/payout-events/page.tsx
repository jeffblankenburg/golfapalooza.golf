"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BTN_BACK, BTN_PRIMARY } from "@/lib/ui/buttons";
import type { PayoutSplit, PayoutSplitKind } from "@/lib/payout-events/splits";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

type Source =
  | "option"
  | "option_value"
  | "scramble"
  | "all_attendees"
  | "pickem_payments"
  | "manual";

interface Row {
  id: string;
  trip_id: string;
  label: string;
  sort_order: number;
  participant_source: Source;
  source_ref: string | null;
  source_filter: { choice_values?: string[]; count?: number } | null;
  amount_per_participant: number;
  day_count: number;
  is_payout: boolean;
  // payout_splits and cost_item_id come from the linked contest at read
  // time (compute.ts projection). On save, the modal sends both here and
  // the API routes them to contests.payout_splits / buy_in_cost_item_id.
  payout_splits: PayoutSplit[] | null;
  cost_item_id: string | null;
  notes: string | null;
  participant_count: number;
  total: number;
  contest_id: string | null;
  contest: {
    id: string;
    name: string;
    contest_type: string;
    day_number: number | null;
  } | null;
}

interface OptionRef {
  id: string;
  name: string;
  choices: Array<{ value: string; label: string; cost?: number }> | null;
}
interface ContestRef {
  id: string;
  name: string;
  contest_type: string;
  day_number?: number | null;
}
interface CostItemRef {
  id: string;
  name: string;
  cost: number;
  category: string | null;
  sort_order: number;
}

const SOURCE_LABELS: Record<Source, string> = {
  option: "Option (any yes-cost)",
  option_value: "Option — specific choice values",
  scramble: "Scramble participants",
  all_attendees: "All attendees",
  pickem_payments: "Pick'em (paid)",
  manual: "Manual count",
};

// Default splits seeded into a contest's payout_splits when admin sets
// the contest_type and there's no existing config. Each entry is an
// admin-editable starting point.
const DEFAULT_SPLITS_BY_CONTEST_TYPE: Record<string, PayoutSplit[] | null> = {
  scramble: [
    { place: 1, kind: "remainder" },
    { place: 2, kind: "flat", amount: 80 },
  ],
  scramble_skins: [{ place: 1, kind: "skins_proportional" }],
  ctp_front: [{ place: 1, kind: "single_winner" }],
  ctp_back: [{ place: 1, kind: "single_winner" }],
  long_drive: [{ place: 1, kind: "single_winner" }],
  long_putt: [{ place: 1, kind: "single_winner" }],
};

const SPLIT_KIND_LABELS: Record<PayoutSplitKind, string> = {
  remainder: "Remainder",
  flat: "Flat $",
  percentage: "Percentage %",
  single_winner: "Single winner (full pot)",
  skins_proportional: "Skins-proportional (calcSkins)",
};


const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

type ModalState = { mode: "add" } | { mode: "edit"; row: Row } | null;

export default function PayoutEventsAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<OptionRef[]>([]);
  const [contests, setContests] = useState<ContestRef[]>([]);
  const [costItems, setCostItems] = useState<CostItemRef[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((d) => {
        const u = d.user;
        if (!u) { router.replace("/admin"); return; }
        if (!(u.is_admin || u.permissions?.manage_finances)) { router.replace("/admin"); return; }
        setAllowed(true);
      })
      .catch(() => router.replace("/admin"));
  }, [router]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/financials/payout-events");
    const data = await r.json();
    setRows(data.rows || []);
    setTripId(data.trip_id || null);

    if (data.trip_id) {
      const [optsRes, contestsRes, costRes] = await Promise.all([
        fetch(`/api/admin/options?trip_id=${data.trip_id}`).catch(() => null),
        fetch(`/api/admin/contests?trip_id=${data.trip_id}`).catch(() => null),
        fetch(`/api/admin/financials/cost-items?trip_id=${data.trip_id}`).catch(() => null),
      ]);
      if (optsRes && optsRes.ok) {
        const od = await optsRes.json();
        setOptions(od.options || od.trip_options || []);
      }
      if (contestsRes && contestsRes.ok) {
        const cd = await contestsRes.json();
        setContests(cd.contests || []);
      }
      if (costRes && costRes.ok) {
        const ci = await costRes.json();
        setCostItems(ci.items || []);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) fetchAll();
  }, [allowed, fetchAll]);

  async function saveRow(id: string, patch: Partial<Row>): Promise<boolean> {
    const before = rows.find((r) => r.id === id);
    let displayPatch: Partial<Row> = patch;
    if ("cost_item_id" in patch && patch.cost_item_id) {
      const ci = costItems.find((c) => c.id === patch.cost_item_id);
      if (ci) displayPatch = { ...patch, amount_per_participant: Number(ci.cost) };
    }
    setRows((prev) =>
      prev.map((r) => {
        if (r.id !== id) return r;
        const merged = { ...r, ...displayPatch };
        const total =
          Math.round(
            Number(merged.amount_per_participant || 0) *
              merged.participant_count *
              (merged.day_count || 1) *
              100,
          ) / 100;
        return { ...merged, total };
      }),
    );
    const res = await fetch(`/api/admin/financials/payout-events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      if (before) setRows((prev) => prev.map((r) => (r.id === id ? before : r)));
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Save failed");
      return false;
    }
    setErrorMsg(null);
    return true;
  }

  async function createRow(patch: Partial<Row>) {
    if (!tripId) return;
    const sortMax = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const res = await fetch("/api/admin/financials/payout-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        sort_order: sortMax + 10,
        participant_source: "manual",
        amount_per_participant: 0,
        day_count: 1,
        is_payout: true,
        ...patch,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      setErrorMsg(err.error || "Create failed");
      return;
    }
    const data = await res.json();
    if (data.row) {
      setRows((prev) => [...prev, { ...data.row, participant_count: 0, total: 0 }]);
    }
    setErrorMsg(null);
    setModal(null);
  }

  async function deleteRow(id: string) {
    const before = rows;
    setRows((prev) => prev.filter((r) => r.id !== id));
    setModal(null);
    const res = await fetch(`/api/admin/financials/payout-events/${id}`, { method: "DELETE" });
    if (!res.ok) {
      setRows(before);
      setErrorMsg("Delete failed");
      return;
    }
    setErrorMsg(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
    const oldIdx = sorted.findIndex((r) => r.id === active.id);
    const newIdx = sorted.findIndex((r) => r.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = [...sorted];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);
    const newSortById = new Map(reordered.map((r, i) => [r.id, i * 10]));
    const before = rows;
    setRows((prev) =>
      prev.map((r) => (newSortById.has(r.id) ? { ...r, sort_order: newSortById.get(r.id)! } : r)),
    );
    try {
      await Promise.all(
        reordered.map((r, i) =>
          fetch(`/api/admin/financials/payout-events/${r.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: i * 10 }),
          }).then((res) => {
            if (!res.ok) throw new Error("reorder save failed");
          }),
        ),
      );
      setErrorMsg(null);
    } catch {
      setRows(before);
      setErrorMsg("Reorder save failed");
    }
  }

  const visibleRows = useMemo(
    () => rows.slice().sort((a, b) => a.sort_order - b.sort_order || a.label.localeCompare(b.label)),
    [rows],
  );

  if (!allowed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="px-4 pt-6 pb-8 space-y-3">
      <Link href="/admin/financials" className={BTN_BACK}>← Financials</Link>

      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Payout Events</h1>
        <button
          type="button"
          onClick={() => setModal({ mode: "add" })}
          className={`${BTN_PRIMARY} whitespace-nowrap`}
        >
          + Add
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        Defines the cash-needed sheet. Live totals reflect option selections, scramble rosters, and Pick&apos;em payments.
      </p>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-600 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-12 border border-dashed border-gray-200 rounded-2xl">
          No events yet. Click <strong className="text-gray-600">+ Add</strong> to start.
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={visibleRows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
              {visibleRows.map((row) => (
                <ItemRow
                  key={row.id}
                  row={row}
                  costItems={costItems}
                  onClick={() => setModal({ mode: "edit", row })}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {modal !== null && (
        <PayoutEventModal
          state={modal}
          options={options}
          contests={contests}
          costItems={costItems}
          onCancel={() => setModal(null)}
          onCreate={createRow}
          onSave={saveRow}
          onDelete={deleteRow}
        />
      )}
    </div>
  );
}

function ItemRow({
  row,
  costItems,
  onClick,
}: {
  row: Row;
  costItems: CostItemRef[];
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: row.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const linked = row.cost_item_id ? costItems.find((c) => c.id === row.cost_item_id) : null;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1.5 px-2 py-2 active:bg-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
      onClick={onClick}
    >
      <div
        {...listeners}
        {...attributes}
        onClick={(e) => e.stopPropagation()}
        className="touch-none p-1 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing flex-shrink-0"
        aria-label="Drag to reorder"
      >
        <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="5" cy="3" r="1.5" />
          <circle cx="11" cy="3" r="1.5" />
          <circle cx="5" cy="8" r="1.5" />
          <circle cx="11" cy="8" r="1.5" />
          <circle cx="5" cy="13" r="1.5" />
          <circle cx="11" cy="13" r="1.5" />
        </svg>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-gray-900 text-sm">{row.label}</span>
          {!row.is_payout && (
            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[9px] font-semibold uppercase tracking-wide">
              pass-through
            </span>
          )}
          {linked && (
            <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[9px] font-semibold uppercase tracking-wide" title={`Linked to: ${linked.name}`}>
              linked
            </span>
          )}
        </div>
        <div className="text-[10px] text-gray-400 mt-0.5 tabular-nums">
          {row.participant_count} × {fmt(row.amount_per_participant)}
        </div>
      </div>

      <div className="text-base font-bold text-gray-900 tabular-nums shrink-0">
        {fmt(row.total)}
      </div>
      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

function PayoutEventModal({
  state,
  options,
  contests,
  costItems,
  onCancel,
  onCreate,
  onSave,
  onDelete,
}: {
  state: NonNullable<ModalState>;
  options: OptionRef[];
  contests: ContestRef[];
  costItems: CostItemRef[];
  onCancel: () => void;
  onCreate: (patch: Partial<Row>) => Promise<void>;
  onSave: (id: string, patch: Partial<Row>) => Promise<boolean>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.row : null;

  const [label, setLabel] = useState(initial?.label ?? "");
  const [contestId, setContestId] = useState<string | null>(initial?.contest_id ?? null);
  const [costItemId, setCostItemId] = useState<string | null>(initial?.cost_item_id ?? null);
  const [participantSource, setParticipantSource] = useState<Source>(initial?.participant_source ?? "manual");
  const [sourceRef, setSourceRef] = useState<string | null>(initial?.source_ref ?? null);
  const [sourceFilter, setSourceFilter] = useState<{ choice_values?: string[]; count?: number } | null>(initial?.source_filter ?? null);
  const [payoutSplits, setPayoutSplits] = useState<PayoutSplit[] | null>(initial?.payout_splits ?? null);
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const linkedContest = contestId ? contests.find((c) => c.id === contestId) : null;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const linkedCostItem = costItemId ? costItems.find((c) => c.id === costItemId) : null;

  const canSave = label.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const patch: Partial<Row> = {
      label: label.trim(),
      contest_id: contestId,
      cost_item_id: costItemId,
      day_count: 1,
      // is_payout: contest-linked rows pay out; non-contest rows are
      // pass-through cash (Lodge), no payout.
      is_payout: !!linkedContest,
      participant_source: participantSource,
      source_ref: sourceRef,
      source_filter: sourceFilter,
      payout_splits: payoutSplits,
      notes: notes.trim() ? notes.trim() : null,
    };
    if (isEdit && initial) {
      const ok = await onSave(initial.id, patch);
      setSaving(false);
      if (ok) onCancel();
      return;
    }
    // For create, include the fallback amount when no cost item is linked.
    // onCreate closes the modal itself on success.
    await onCreate({
      ...patch,
      amount_per_participant: linkedCostItem ? Number(linkedCostItem.cost) : 0,
    });
    setSaving(false);
  }

  async function handleDelete() {
    if (!isEdit || !initial) return;
    setSaving(true);
    await onDelete(initial.id);
  }

  // When admin changes the participant source, clear source_ref + source_filter
  function changeParticipantSource(next: Source) {
    setParticipantSource(next);
    setSourceRef(null);
    setSourceFilter(null);
  }

  // Source-ref picker depending on participant_source
  const sourceRefPicker = (() => {
    if (participantSource === "option" || participantSource === "option_value") {
      return (
        <select
          value={sourceRef || ""}
          onChange={(e) => setSourceRef(e.target.value || null)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
        >
          <option value="">— pick option —</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      );
    }
    if (participantSource === "scramble") {
      return (
        <select
          value={sourceRef || ""}
          onChange={(e) => setSourceRef(e.target.value || null)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
        >
          <option value="">— pick scramble —</option>
          {contests.filter((c) => c.contest_type === "scramble").map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    if (participantSource === "pickem_payments") {
      return (
        <select
          value={sourceRef || ""}
          onChange={(e) => setSourceRef(e.target.value || null)}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
        >
          <option value="">— pick pickem contest —</option>
          {contests.filter((c) => c.contest_type === "pickem").map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    return null;
  })();

  const filterEditor = (() => {
    if (participantSource === "option_value") {
      const opt = options.find((o) => o.id === sourceRef);
      const selected = new Set(sourceFilter?.choice_values || []);
      if (!opt) {
        return <span className="text-xs text-gray-400">Pick the option above first.</span>;
      }
      return (
        <div className="flex flex-wrap gap-1.5">
          {(opt.choices || []).map((ch) => (
            <label key={ch.value} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-50 rounded border border-gray-200">
              <input
                type="checkbox"
                checked={selected.has(ch.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(ch.value);
                  else next.delete(ch.value);
                  setSourceFilter({ choice_values: [...next] });
                }}
              />
              {ch.label}
            </label>
          ))}
        </div>
      );
    }
    if (participantSource === "manual") {
      return (
        <input
          type="number"
          min={0}
          value={sourceFilter?.count ?? 0}
          onChange={(e) => setSourceFilter({ count: Number(e.target.value) || 0 })}
          className="border border-gray-300 rounded-md px-2 py-1.5 text-sm w-28"
          placeholder="count"
        />
      );
    }
    return null;
  })();

  return (
    <div className="fixed top-14 left-0 right-0 z-35 flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-full flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? "Edit payout event" : "New payout event"}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-4 overflow-y-auto">
          <label className="flex flex-col">
            <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Label</span>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              autoFocus={!isEdit}
              placeholder="e.g. Thursday Skins"
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            />
          </label>

          {/* Contest — when linked, the contest determines who pays
              (via cost item links), who wins (via contest_type + day),
              and seeds the payout splits. */}
          <label className="flex flex-col">
            <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Contest</span>
            <select
              value={contestId ?? ""}
              onChange={(e) => setContestId(e.target.value || null)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">— none (pass-through cash) —</option>
              {contests
                .slice()
                .sort((a, b) => (a.day_number ?? 99) - (b.day_number ?? 99) || a.name.localeCompare(b.name))
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            {linkedContest && (
              <span className="text-[10px] text-gray-400 mt-1">
                Type: {linkedContest.contest_type}.
                Edits to cost item and payout splits below save to this contest.
              </span>
            )}
            {!linkedContest && (
              <span className="text-[10px] text-gray-400 mt-1">
                No contest = pass-through cash (e.g. Lodge nights). Configure who pays
                and how it&apos;s distributed manually below.
              </span>
            )}
          </label>

          <label className="flex flex-col">
            <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Cost item</span>
            <select
              value={costItemId ?? ""}
              onChange={(e) => setCostItemId(e.target.value || null)}
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            >
              <option value="">— none —</option>
              {costItems
                .slice()
                .sort((a, b) => (a.category || "zzz").localeCompare(b.category || "zzz") || a.sort_order - b.sort_order || a.name.localeCompare(b.name))
                .map((ci) => (
                  <option key={ci.id} value={ci.id}>
                    {ci.name} — {fmt(Number(ci.cost))}
                  </option>
                ))}
            </select>
            {linkedCostItem && (
              <span className="text-[10px] text-gray-400 mt-1">
                $/Person comes from this cost item ({fmt(Number(linkedCostItem.cost))}). Edit on the Cost Items page.
              </span>
            )}
          </label>

          {/* Participant source — only relevant for pass-through rows
              (no contest). When a contest is linked, who-pays comes from
              the cost item's option/choice links. */}
          {!linkedContest && (
            <div className="space-y-2">
              <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">Who pays / participates</span>
              <select
                value={participantSource}
                onChange={(e) => changeParticipantSource(e.target.value as Source)}
                className="w-full border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                {(Object.entries(SOURCE_LABELS) as Array<[Source, string]>).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {sourceRefPicker && <div>{sourceRefPicker}</div>}
              {filterEditor && <div>{filterEditor}</div>}
            </div>
          )}

          {/* Payout splits — how the pot divides among places. Saves to
              the linked contest's `payout_splits`. Hidden for non-contest
              rows (Lodge / pass-through cash) — they have no payout. */}
          {linkedContest && payoutSplits !== null && (
            <PayoutSplitsEditor
              splits={payoutSplits}
              onChange={setPayoutSplits}
            />
          )}
          {linkedContest && payoutSplits === null && (
            <button
              type="button"
              onClick={() => {
                const seeded = DEFAULT_SPLITS_BY_CONTEST_TYPE[linkedContest.contest_type];
                setPayoutSplits(
                  seeded ? structuredClone(seeded) : [{ place: 1, kind: "single_winner" }],
                );
              }}
              className="text-xs text-green-700 underline"
            >
              + Add payout splits
            </button>
          )}

          <label className="flex flex-col">
            <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Notes</span>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="(optional)"
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            />
          </label>

          {isEdit && (
            <div className="pt-3 mt-3 border-t border-gray-100">
              {!confirmingDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmingDelete(true)}
                  disabled={saving}
                  className="w-full py-2 rounded-lg text-sm font-medium text-red-600 bg-red-50 border border-red-200 active:bg-red-100"
                >
                  Delete this event
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 px-1">
                    Permanently delete &ldquo;{initial?.label}&rdquo;?
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={saving}
                      className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 active:opacity-80"
                    >
                      Confirm delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDelete(false)}
                      disabled={saving}
                      className="flex-1 py-2 rounded-lg text-sm font-medium text-gray-600 border border-gray-300 active:bg-gray-50"
                    >
                      Keep
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={`flex-1 py-3 rounded-xl font-semibold text-[15px] active:opacity-80 ${
              canSave ? "bg-green-600 text-white" : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="flex-1 py-3 border border-gray-300 rounded-xl font-semibold text-[15px] text-gray-600 active:bg-gray-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function PayoutSplitsEditor({
  splits,
  onChange,
}: {
  splits: PayoutSplit[];
  onChange: (next: PayoutSplit[]) => void;
}) {
  function updateSplit(idx: number, patch: Partial<PayoutSplit>) {
    onChange(splits.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }
  function removeSplit(idx: number) {
    onChange(splits.filter((_, i) => i !== idx));
  }
  function addSplit() {
    const nextPlace = (splits.reduce((m, s) => Math.max(m, s.place), 0) || 0) + 1;
    onChange([...splits, { place: nextPlace, kind: "flat", amount: 0 }]);
  }

  return (
    <div className="space-y-2">
      <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
        Payout splits
      </span>
      <div className="space-y-1.5">
        {splits.map((s, idx) => {
          const showAmount = s.kind === "flat" || s.kind === "percentage";
          return (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                value={s.place}
                onChange={(e) => updateSplit(idx, { place: Number(e.target.value) || 1 })}
                className="w-12 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white tabular-nums"
              />
              <select
                value={s.kind}
                onChange={(e) => {
                  const nextKind = e.target.value as PayoutSplitKind;
                  const nextAmount = nextKind === "flat" || nextKind === "percentage" ? (s.amount ?? 0) : undefined;
                  updateSplit(idx, { kind: nextKind, amount: nextAmount });
                }}
                className="flex-1 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                {(Object.entries(SPLIT_KIND_LABELS) as Array<[PayoutSplitKind, string]>).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
              {showAmount ? (
                <input
                  type="number"
                  step={s.kind === "percentage" ? "0.01" : "1"}
                  min={0}
                  value={s.amount ?? 0}
                  onChange={(e) => updateSplit(idx, { amount: Number(e.target.value) || 0 })}
                  className="w-20 border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white tabular-nums"
                  placeholder={s.kind === "flat" ? "$" : "%"}
                />
              ) : (
                <span className="w-20 text-xs text-gray-300 text-center">—</span>
              )}
              <button
                type="button"
                onClick={() => removeSplit(idx)}
                title="Remove this split"
                className="p-1 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
      <button
        type="button"
        onClick={addSplit}
        className="text-[11px] text-green-700 font-medium active:opacity-70"
      >
        + Add place
      </button>
      {splits.length > 0 && (
        <div className="text-[10px] text-gray-400 leading-snug">
          Place numbers indicate finishing position (1 = winner, 2 = runner-up, …).{" "}
          Splits are applied in order: flat amounts and percentages take their cut first,
          then <em>Remainder</em> absorbs whatever&apos;s left.
        </div>
      )}
    </div>
  );
}

