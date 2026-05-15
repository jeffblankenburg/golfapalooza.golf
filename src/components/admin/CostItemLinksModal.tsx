"use client";

import { useEffect, useState, useMemo, useCallback } from "react";
import {
  CATEGORY_LABELS,
  UNCATEGORIZED_KEY,
  UNCATEGORIZED_LABEL,
  groupByCategory,
  compareCostItems,
} from "@/lib/cost-items/categories";
import { DragHandle } from "@/components/DragHandle";

interface CostItem {
  id: string;
  name: string;
  cost: number;
  category: string | null;
  sort_order: number;
  linked_option_id: string | null;
  linked_choices: string[]; // populated by the loader
  included_in_trip_cost: boolean;
}

interface OptionChoice {
  label?: string;
  value: string;
  cost?: number | null;
}

interface OptionInput {
  id: string;
  name: string;
  option_type: string;
  cost?: number | null;
  choices?: OptionChoice[] | null;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

export function CostItemLinksModal({
  option,
  tripId,
  onClose,
  onSaved,
}: {
  option: OptionInput;
  tripId: string;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const [allItems, setAllItems] = useState<CostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Working copy: the link state admin is editing (uncommitted until Save).
  // Map<costItemId, { linkedHere: boolean; choices: Set<choice_value> }>
  const [draft, setDraft] = useState<Map<string, { linkedHere: boolean; choices: Set<string> }>>(
    new Map(),
  );

  const isCheckbox = option.option_type === "checkbox";
  const choices = useMemo(
    () => (Array.isArray(option.choices) ? option.choices : []),
    [option.choices],
  );

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(`/api/admin/financials/cost-items?trip_id=${tripId}`);
    const data = await r.json();

    // Junction rows for ALL items (we need to know all choices each item already triggers).
    const itemIds = (data.items || []).map((i: { id: string }) => i.id);
    const choiceRowsByItem = new Map<string, string[]>();
    if (itemIds.length > 0) {
      const j = await fetch(`/api/admin/financials/cost-items/links?trip_id=${tripId}`);
      if (j.ok) {
        const jd = await j.json();
        for (const row of jd.junction || []) {
          if (!choiceRowsByItem.has(row.cost_item_id)) {
            choiceRowsByItem.set(row.cost_item_id, []);
          }
          choiceRowsByItem.get(row.cost_item_id)!.push(row.choice_value);
        }
      }
    }

    // Cost items flagged `included_in_trip_cost` flow into the Trip Cost
    // option (option_type='trip_cost') automatically. Linking them to a
    // regular option would double-count them — hide from this picker.
    const items: CostItem[] = (data.items || [])
      .filter((i: CostItem) => !i.included_in_trip_cost)
      .map((i: CostItem) => ({
        ...i,
        linked_choices: choiceRowsByItem.get(i.id) || [],
      }));
    setAllItems(items);

    // Initialize draft from current state, scoped to THIS option.
    const initial = new Map<string, { linkedHere: boolean; choices: Set<string> }>();
    for (const it of items) {
      initial.set(it.id, {
        linkedHere: it.linked_option_id === option.id,
        choices: new Set(it.linked_option_id === option.id ? it.linked_choices : []),
      });
    }
    setDraft(initial);
    setLoading(false);
  }, [tripId, option.id]);

  useEffect(() => { load(); }, [load]);

  // Items grouped by their category, sorted within each group by sort_order
  // (admin's manual order on the cost-items page). Items linked elsewhere
  // stay visible but greyed.
  const groupedVisibleItems = useMemo(() => {
    const sorted = allItems.slice().sort(compareCostItems);
    return groupByCategory(sorted);
  }, [allItems]);

  function toggleLinkedHere(itemId: string, checked: boolean) {
    setDraft((prev) => {
      const next = new Map(prev);
      const cur = next.get(itemId) || { linkedHere: false, choices: new Set<string>() };
      next.set(itemId, {
        linkedHere: checked,
        choices: checked ? cur.choices : new Set(),
      });
      return next;
    });
  }

  function toggleChoice(itemId: string, choiceValue: string, checked: boolean) {
    setDraft((prev) => {
      const next = new Map(prev);
      const cur = next.get(itemId) || { linkedHere: false, choices: new Set<string>() };
      const newChoices = new Set(cur.choices);
      if (checked) newChoices.add(choiceValue);
      else newChoices.delete(choiceValue);
      next.set(itemId, {
        // Auto-link to this option if any choice gets checked
        linkedHere: cur.linkedHere || checked,
        choices: newChoices,
      });
      return next;
    });
  }

  // Total computed for a particular choice (or for the option itself if checkbox)
  function totalFor(choiceValue: string | null): number {
    let total = 0;
    for (const it of allItems) {
      const d = draft.get(it.id);
      if (!d || !d.linkedHere) continue;
      if (choiceValue === null) {
        // Checkbox: only items with NO choice rows count toward the flat cost
        if (d.choices.size === 0) total += Number(it.cost);
      } else {
        if (d.choices.has(choiceValue)) total += Number(it.cost);
      }
    }
    return total;
  }

  async function handleSave() {
    setSaving(true);
    setErrorMsg(null);
    try {
      // For each cost_item whose draft state differs from current state, send a PUT.
      const updates: Array<{ id: string; linked_option_id: string | null; linked_choices: string[] }> = [];
      for (const it of allItems) {
        const d = draft.get(it.id);
        if (!d) continue;
        const currentLinked = it.linked_option_id === option.id;
        const currentChoices = new Set(it.linked_option_id === option.id ? it.linked_choices : []);
        const draftChoices = d.choices;
        const linkedChanged = currentLinked !== d.linkedHere;
        const choicesChanged =
          currentChoices.size !== draftChoices.size ||
          [...draftChoices].some((c) => !currentChoices.has(c));
        if (!linkedChanged && !choicesChanged) continue;

        const payload: { id: string; linked_option_id: string | null; linked_choices: string[] } = {
          id: it.id,
          linked_option_id: d.linkedHere ? option.id : null,
          linked_choices: [...draftChoices],
        };
        // Don't unlink an item that's currently linked to a DIFFERENT option.
        // (visibleItems shows them but greys them out; toggle is disabled below.)
        if (it.linked_option_id && it.linked_option_id !== option.id && !d.linkedHere) {
          continue;
        }
        updates.push(payload);
      }

      await Promise.all(
        updates.map((u) =>
          fetch(`/api/admin/financials/cost-items/${u.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              linked_option_id: u.linked_option_id,
              linked_choices: u.linked_choices,
            }),
          }).then((r) => {
            if (!r.ok) throw new Error("save failed");
          }),
        ),
      );
      onSaved?.();
      onClose();
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed top-14 left-0 right-0 z-35 flex items-end justify-center bottom-[calc(4rem+env(safe-area-inset-bottom))]">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-2xl bg-white rounded-t-3xl animate-slide-up max-h-full flex flex-col">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100 shrink-0">
          <DragHandle onClose={onClose} className="mb-4" />
          <h2 className="text-xl font-bold text-gray-900">{option.name} — Cost Items</h2>
          <p className="text-xs text-gray-500 mt-0.5">
            Pick the cost items that fund this option. The option&apos;s price will be the sum.
          </p>
        </div>

        {errorMsg && (
          <div className="mx-6 mt-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2">
            {errorMsg}
          </div>
        )}

        <div className="px-6 py-4 overflow-y-auto flex-1 space-y-4">
          {loading ? (
            <div className="flex justify-center py-6">
              <div className="w-6 h-6 border-3 border-green-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : isCheckbox ? (
            <CheckboxLinksSection
              groupedItems={groupedVisibleItems}
              optionId={option.id}
              draft={draft}
              total={totalFor(null)}
              toggleLinkedHere={toggleLinkedHere}
            />
          ) : (
            <>
              {choices.map((ch) => (
                <ChoiceLinksSection
                  key={ch.value}
                  choice={ch}
                  groupedItems={groupedVisibleItems}
                  optionId={option.id}
                  draft={draft}
                  total={totalFor(ch.value)}
                  toggleChoice={toggleChoice}
                />
              ))}
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || loading}
            className={`flex-1 py-3 rounded-xl font-semibold text-[15px] active:opacity-80 ${
              saving || loading ? "bg-gray-200 text-gray-400 cursor-not-allowed" : "bg-green-600 text-white"
            }`}
          >
            {saving ? "Saving…" : "Save links"}
          </button>
          <button
            type="button"
            onClick={onClose}
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

function CheckboxLinksSection({
  groupedItems,
  optionId,
  draft,
  total,
  toggleLinkedHere,
}: {
  groupedItems: Map<string, CostItem[]>;
  optionId: string;
  draft: Map<string, { linkedHere: boolean; choices: Set<string> }>;
  total: number;
  toggleLinkedHere: (id: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold">
          Linked cost items
        </span>
        <div className="text-lg font-bold text-green-700 tabular-nums leading-none">{fmt(total)}</div>
      </div>
      <GroupedItemList
        groupedItems={groupedItems}
        optionId={optionId}
        draft={draft}
        choiceValue={null}
        toggleLinkedHere={toggleLinkedHere}
      />
    </div>
  );
}

function ChoiceLinksSection({
  choice,
  groupedItems,
  optionId,
  draft,
  total,
  toggleChoice,
}: {
  choice: OptionChoice;
  groupedItems: Map<string, CostItem[]>;
  optionId: string;
  draft: Map<string, { linkedHere: boolean; choices: Set<string> }>;
  total: number;
  toggleChoice: (itemId: string, choiceValue: string, checked: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-gray-900">
          {choice.label || choice.value}
        </span>
        <div className="text-lg font-bold text-green-700 tabular-nums leading-none">{fmt(total)}</div>
      </div>
      <GroupedItemList
        groupedItems={groupedItems}
        optionId={optionId}
        draft={draft}
        choiceValue={choice.value}
        toggleChoice={toggleChoice}
      />
    </div>
  );
}

function GroupedItemList({
  groupedItems,
  optionId,
  draft,
  choiceValue,
  toggleLinkedHere,
  toggleChoice,
}: {
  groupedItems: Map<string, CostItem[]>;
  optionId: string;
  draft: Map<string, { linkedHere: boolean; choices: Set<string> }>;
  choiceValue: string | null;
  toggleLinkedHere?: (id: string, checked: boolean) => void;
  toggleChoice?: (id: string, choiceValue: string, checked: boolean) => void;
}) {
  const totalCount = [...groupedItems.values()].reduce((s, g) => s + g.length, 0);
  if (totalCount === 0) {
    return (
      <div className="border border-gray-200 rounded-lg px-3 py-4 text-xs text-gray-400 text-center">
        No cost items in this trip yet.
      </div>
    );
  }
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
      {[...groupedItems.entries()].map(([cat, items]) => {
        if (items.length === 0) return null;
        const label = cat === UNCATEGORIZED_KEY ? UNCATEGORIZED_LABEL : CATEGORY_LABELS[cat] || cat;
        return (
          <div key={cat}>
            <div className="px-3 py-1 bg-gray-50 border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-500 font-semibold sticky top-0">
              {label}
            </div>
            <div className="divide-y divide-gray-100">
              {items.map((it) => {
                const d = draft.get(it.id);
                const linkedElsewhere = it.linked_option_id !== null && it.linked_option_id !== optionId;
                const checked = choiceValue === null
                  ? !!d?.linkedHere && (d.choices.size === 0)
                  : !!d?.choices.has(choiceValue);
                return (
                  <label
                    key={it.id}
                    className={`flex items-center gap-2 px-3 py-1.5 ${
                      linkedElsewhere ? "opacity-40" : "active:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={linkedElsewhere}
                      onChange={(e) => {
                        if (choiceValue === null) toggleLinkedHere?.(it.id, e.target.checked);
                        else toggleChoice?.(it.id, choiceValue, e.target.checked);
                      }}
                      className="rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-gray-900 truncate">{it.name}</div>
                      {linkedElsewhere && (
                        <div className="text-[10px] text-gray-400">linked to another option</div>
                      )}
                    </div>
                    <span className="text-sm font-semibold text-gray-700 tabular-nums shrink-0">{fmt(Number(it.cost))}</span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
