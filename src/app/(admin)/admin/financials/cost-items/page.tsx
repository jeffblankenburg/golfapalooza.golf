"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BTN_BACK, BTN_PRIMARY } from "@/lib/ui/buttons";
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
import { DragHandle } from "@/components/DragHandle";

interface CostItem {
  id: string;
  trip_id: string;
  name: string;
  description: string | null;
  cost: number;
  category: string | null;
  included_in_trip_cost: boolean;
  sort_order: number;
  notes: string | null;
}

import {
  CATEGORY_OPTIONS,
  CATEGORY_LABELS,
} from "@/lib/cost-items/categories";

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

type ModalState =
  | { mode: "add"; initialCategory: string }
  | { mode: "edit"; item: CostItem }
  | null;

export default function CostItemsAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<CostItem[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  async function handleDragEnd(categoryKey: string, event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Build the current (sorted) list for this category from items state.
    const inCategory = (i: CostItem) =>
      categoryKey === "__uncategorized__"
        ? !i.category || !CATEGORY_OPTIONS.some((o) => o.value === i.category)
        : i.category === categoryKey;
    const groupItems = items
      .filter(inCategory)
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order);

    const oldIdx = groupItems.findIndex((i) => i.id === active.id);
    const newIdx = groupItems.findIndex((i) => i.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;

    const reordered = [...groupItems];
    const [moved] = reordered.splice(oldIdx, 1);
    reordered.splice(newIdx, 0, moved);

    // Reassign sort_order sequentially within this category.
    const newSortById = new Map(reordered.map((it, idx) => [it.id, idx]));

    // Optimistic update: only items in this category get new sort_orders.
    const before = items;
    setItems((prev) =>
      prev.map((it) =>
        newSortById.has(it.id) ? { ...it, sort_order: newSortById.get(it.id)! } : it,
      ),
    );

    try {
      await Promise.all(
        reordered.map((it, idx) =>
          fetch(`/api/admin/financials/cost-items/${it.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sort_order: idx }),
          }).then((r) => {
            if (!r.ok) throw new Error("reorder save failed");
          }),
        ),
      );
      setErrorMsg(null);
    } catch {
      setItems(before);
      setErrorMsg("Reorder save failed");
    }
  }

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
    const r = await fetch("/api/admin/financials/cost-items");
    const data = await r.json();
    setItems(data.items || []);
    setTripId(data.trip_id || null);
    setLoading(false);
  }, []);

  useEffect(() => { if (allowed) fetchAll(); }, [allowed, fetchAll]);

  async function submitNewItem(input: NewItemInput) {
    if (!tripId) return;
    const sortMax = items
      .filter((i) => i.category === input.category)
      .reduce((m, i) => Math.max(m, i.sort_order), 0);
    const r = await fetch("/api/admin/financials/cost-items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trip_id: tripId, ...input, sort_order: sortMax + 10 }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      setErrorMsg(err.error || "Create failed");
      return;
    }
    const data = await r.json();
    if (data.item) setItems((prev) => [...prev, data.item]);
    setErrorMsg(null);
    setModal(null);
  }

  async function saveExistingItem(id: string, input: NewItemInput) {
    const before = items.find((i) => i.id === id);
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...input } : i)));
    const r = await fetch(`/api/admin/financials/cost-items/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!r.ok) {
      if (before) setItems((prev) => prev.map((i) => (i.id === id ? before : i)));
      const err = await r.json().catch(() => ({}));
      setErrorMsg(err.error || "Save failed");
      return;
    }
    setErrorMsg(null);
    setModal(null);
  }

  async function deleteItem(id: string) {
    const before = items;
    setItems((prev) => prev.filter((i) => i.id !== id));
    setModal(null);
    const r = await fetch(`/api/admin/financials/cost-items/${id}`, { method: "DELETE" });
    if (!r.ok) {
      setItems(before);
      setErrorMsg("Delete failed");
      return;
    }
    setErrorMsg(null);
  }

  const tripCostTotal = useMemo(
    () => items.filter((i) => i.included_in_trip_cost).reduce((s, i) => s + Number(i.cost), 0),
    [items],
  );

  const groupedItems = useMemo(() => {
    const groups = new Map<string, CostItem[]>();
    for (const o of CATEGORY_OPTIONS) groups.set(o.value, []);
    groups.set("__uncategorized__", []);
    for (const item of items) {
      const cat = item.category && groups.has(item.category) ? item.category : "__uncategorized__";
      groups.get(cat)!.push(item);
    }
    for (const [, group] of groups) {
      group.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
    }
    return groups;
  }, [items]);

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
        <h1 className="text-2xl font-bold text-gray-900">Cost Items</h1>
        <button
          type="button"
          onClick={() => setModal({ mode: "add", initialCategory: "other" })}
          className={`${BTN_PRIMARY} whitespace-nowrap`}
        >
          + Add
        </button>
      </div>
      <p className="text-xs text-gray-500 -mt-1">
        Bookkeeping ledger.{" "}
        <span className="text-amber-700 font-medium">Admin-only — never shown to Loozers.</span>
      </p>

      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-600 underline">dismiss</button>
        </div>
      )}

      <div className="bg-green-50 border border-green-200 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-green-700 font-semibold">
            Trip Cost
          </div>
          <div className="text-[11px] text-green-600">
            sum of items bundled into the trip cost
          </div>
        </div>
        <div className="text-2xl font-bold text-green-700 tabular-nums leading-none">{fmt(tripCostTotal)}</div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-12 border border-dashed border-gray-200 rounded-2xl">
          No cost items yet. Click <strong className="text-gray-600">+ Add</strong> to start the breakdown.
        </div>
      ) : (
        <div className="space-y-4">
          {[...groupedItems.entries()].map(([cat, group]) => {
            if (group.length === 0) return null;
            const label = cat === "__uncategorized__" ? "Uncategorized" : CATEGORY_LABELS[cat] || cat;
            return (
              <div key={cat} className="space-y-1">
                <h2 className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider px-1">
                  {label}
                </h2>
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={(event) => handleDragEnd(cat, event)}
                >
                  <SortableContext
                    items={group.map((g) => g.id)}
                    strategy={verticalListSortingStrategy}
                  >
                    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
                      {group.map((item) => (
                        <ItemRow
                          key={item.id}
                          item={item}
                          onClick={() => setModal({ mode: "edit", item })}
                        />
                      ))}
                    </div>
                  </SortableContext>
                </DndContext>
              </div>
            );
          })}
        </div>
      )}

      {modal !== null && (
        <CostItemModal
          state={modal}
          onCancel={() => setModal(null)}
          onCreate={submitNewItem}
          onUpdate={saveExistingItem}
          onDelete={deleteItem}
        />
      )}
    </div>
  );
}

function ItemRow({ item, onClick }: { item: CostItem; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

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
          <span className="font-medium text-gray-900 text-sm">{item.name}</span>
          {item.included_in_trip_cost && (
            <span className="px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[9px] font-semibold uppercase tracking-wide">
              in trip
            </span>
          )}
        </div>
        {item.notes && (
          <div className="text-[10px] text-gray-400 truncate mt-0.5">{item.notes}</div>
        )}
      </div>

      <div className="text-base font-bold text-gray-900 tabular-nums shrink-0">
        {fmt(item.cost)}
      </div>
      <svg className="w-4 h-4 text-gray-300 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}

interface NewItemInput {
  name: string;
  cost: number;
  category: string;
  included_in_trip_cost: boolean;
  notes: string | null;
}

function CostItemModal({
  state,
  onCancel,
  onCreate,
  onUpdate,
  onDelete,
}: {
  state: NonNullable<ModalState>;
  onCancel: () => void;
  onCreate: (input: NewItemInput) => Promise<void>;
  onUpdate: (id: string, input: NewItemInput) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const isEdit = state.mode === "edit";
  const initial = isEdit ? state.item : null;

  const [name, setName] = useState(initial?.name ?? "");
  const [cost, setCost] = useState(initial ? String(initial.cost) : "");
  const [category, setCategory] = useState(
    initial?.category ?? (state.mode === "add" ? state.initialCategory : "other"),
  );
  const [includedInTripCost, setIncludedInTripCost] = useState(
    initial?.included_in_trip_cost ?? false,
  );
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const canSave = name.trim().length > 0 && !saving;

  async function handleSave() {
    if (!canSave) return;
    setSaving(true);
    const input: NewItemInput = {
      name: name.trim(),
      cost: Number(cost) || 0,
      category,
      included_in_trip_cost: includedInTripCost,
      notes: notes.trim() ? notes.trim() : null,
    };
    if (isEdit && initial) {
      await onUpdate(initial.id, input);
    } else {
      await onCreate(input);
    }
    setSaving(false);
  }

  async function handleDelete() {
    if (!isEdit || !initial) return;
    setSaving(true);
    await onDelete(initial.id);
    // modal closes from parent
  }

  return (
    <div className="fixed top-14 left-0 right-0 z-35 flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl animate-slide-up max-h-full flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <DragHandle onClose={onCancel} className="mb-4" />
          <h2 className="text-xl font-bold text-gray-900">
            {isEdit ? "Edit cost item" : "New cost item"}
          </h2>
        </div>

        <div className="px-6 py-4 space-y-3 overflow-y-auto">
          <label className="flex flex-col">
            <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Name</span>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus={!isEdit}
              placeholder="e.g. Hotel — main 3 nights"
              className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col">
              <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Cost</span>
              <input
                type="number"
                step="0.01"
                min={0}
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                placeholder="0.00"
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white tabular-nums"
              />
            </label>
            <label className="flex flex-col">
              <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="border border-gray-300 rounded-md px-2 py-1.5 text-sm bg-white"
              >
                {CATEGORY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={includedInTripCost}
              onChange={(e) => setIncludedInTripCost(e.target.checked)}
              className="rounded"
            />
            <span className="text-gray-700">Bundled into Trip Cost</span>
          </label>

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
                  Delete this cost item
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs text-red-700 px-1">
                    Permanently delete &ldquo;{initial?.name}&rdquo;?
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
