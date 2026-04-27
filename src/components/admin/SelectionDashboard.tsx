"use client";

import { useState, useEffect, useCallback, useRef } from "react";

// ── Types ──────────────────────────────────────────────────────────────

interface Participant {
  user_id: string;
  user: {
    id: string;
    display_name: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface Choice {
  label: string;
  value: string;
  cost?: number;
}

interface OptionGroup {
  id: string;
  name: string;
  sort_order: number;
}

interface TripOption {
  id: string;
  group_id: string;
  name: string;
  description?: string;
  option_type: "checkbox" | "select" | "multi_select" | "text" | "number";
  choices?: Choice[];
  cost?: number;
  is_required?: boolean;
  sort_order: number;
  option_groups?: { id: string; name: string; sort_order: number };
}

interface SelectionValue {
  id: string;
  value: unknown;
}

type SelectionsMap = Record<string, Record<string, SelectionValue>>;

// ── Helpers ────────────────────────────────────────────────────────────

function calcLoozerCost(
  userId: string,
  options: TripOption[],
  selections: SelectionsMap
): number {
  let total = 0;
  const userSels = selections[userId] || {};

  for (const opt of options) {
    const sel = userSels[opt.id];
    if (!sel) continue;

    if (opt.option_type === "checkbox") {
      if (sel.value === true && opt.cost) total += Number(opt.cost);
    } else if (opt.option_type === "select") {
      const choices = (opt.choices || []) as Choice[];
      const matched = choices.find((c) => c.value === sel.value);
      if (matched?.cost) total += Number(matched.cost);
    } else if (opt.option_type === "multi_select") {
      const choices = (opt.choices || []) as Choice[];
      const selected = Array.isArray(sel.value) ? sel.value : [];
      for (const val of selected) {
        const matched = choices.find((c) => c.value === val);
        if (matched?.cost) total += Number(matched.cost);
      }
    }
  }

  return total;
}

function formatCost(cents: number): string {
  return `$${cents.toLocaleString()}`;
}

// ── Cell Components ────────────────────────────────────────────────────

function CheckboxCell({
  checked,
  saving,
  onChange,
}: {
  checked: boolean;
  saving: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className={`flex items-center justify-center ${saving ? "opacity-50" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
      />
    </div>
  );
}

function SelectCell({
  value,
  choices,
  saving,
  onChange,
}: {
  value: string;
  choices: Choice[];
  saving: boolean;
  onChange: (v: string | null) => void;
}) {
  return (
    <div className={saving ? "opacity-50" : ""}>
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
      >
        <option value="">--</option>
        {choices.map((c) => (
          <option key={c.value} value={c.value}>
            {c.label}{c.cost ? ` ($${c.cost})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function MultiSelectCell({
  selected,
  choices,
  saving,
  onChange,
}: {
  selected: string[];
  choices: Choice[];
  saving: boolean;
  onChange: (v: string[]) => void;
}) {
  const toggle = (val: string) => {
    const next = selected.includes(val)
      ? selected.filter((s) => s !== val)
      : [...selected, val];
    onChange(next.length > 0 ? next : []);
  };

  return (
    <div className={`flex flex-wrap gap-1 ${saving ? "opacity-50" : ""}`}>
      {choices.map((c) => (
        <label key={c.value} className="flex items-center gap-0.5 text-xs whitespace-nowrap">
          <input
            type="checkbox"
            checked={selected.includes(c.value)}
            onChange={() => toggle(c.value)}
            className="h-3 w-3 rounded border-gray-300 text-green-600 focus:ring-green-500"
          />
          {c.label}
        </label>
      ))}
    </div>
  );
}

function TextCell({
  value,
  saving,
  onChange,
}: {
  value: string;
  saving: boolean;
  onChange: (v: string | null) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = (v: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(v || null);
    }, 600);
  };

  return (
    <div className={saving ? "opacity-50" : ""}>
      <input
        type="text"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          commit(e.target.value);
        }}
        className="w-full rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
      />
    </div>
  );
}

function NumberCell({
  value,
  saving,
  onChange,
}: {
  value: string;
  saving: boolean;
  onChange: (v: number | null) => void;
}) {
  const [local, setLocal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const commit = (v: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      onChange(v ? Number(v) : null);
    }, 600);
  };

  return (
    <div className={saving ? "opacity-50" : ""}>
      <input
        type="number"
        value={local}
        onChange={(e) => {
          setLocal(e.target.value);
          commit(e.target.value);
        }}
        className="w-24 rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:border-green-500 focus:ring-1 focus:ring-green-500"
      />
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────

export function SelectionDashboard({ tripId }: { tripId: string }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [options, setOptions] = useState<TripOption[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [selections, setSelections] = useState<SelectionsMap>({});
  const [loading, setLoading] = useState(true);
  const [savingCells, setSavingCells] = useState<Set<string>>(new Set());

  // ── Data fetching ──

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [partRes, optRes, groupRes, selRes] = await Promise.all([
        fetch(`/api/admin/participants?trip_id=${tripId}`),
        fetch(`/api/admin/options?trip_id=${tripId}`),
        fetch(`/api/admin/options/groups?trip_id=${tripId}`),
        fetch(`/api/admin/selections?trip_id=${tripId}`),
      ]);

      const [partData, optData, groupData, selData] = await Promise.all([
        partRes.json(),
        optRes.json(),
        groupRes.json(),
        selRes.json(),
      ]);

      // participants endpoint returns { users: [...] } with is_participating flag
      // We need to filter to only participating users and map to our Participant shape
      if (partData.users) {
        const participating = partData.users
          .filter((u: { is_participating: boolean }) => u.is_participating)
          .map((u: { id: string; display_name: string; full_name: string | null; avatar_url: string | null }) => ({
            user_id: u.id,
            user: { id: u.id, display_name: u.display_name, full_name: u.full_name, avatar_url: u.avatar_url },
          }));
        setParticipants(participating);
      } else if (partData.participants) {
        setParticipants(partData.participants);
      }

      if (optData.options) setOptions(optData.options);
      if (groupData.groups) setGroups(groupData.groups);
      if (selData.selections) setSelections(selData.selections);
    } catch (err) {
      console.error("Failed to fetch selection data", err);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  // ── Save handler ──

  const saveSelection = async (userId: string, optionId: string, value: unknown) => {
    const cellKey = `${userId}:${optionId}`;
    setSavingCells((prev) => new Set(prev).add(cellKey));

    // Optimistic update
    setSelections((prev) => {
      const next = { ...prev };
      if (!next[userId]) next[userId] = {};

      if (value === null || value === undefined || value === false || (Array.isArray(value) && value.length === 0)) {
        const userSels = { ...next[userId] };
        delete userSels[optionId];
        next[userId] = userSels;
      } else {
        next[userId] = {
          ...next[userId],
          [optionId]: { id: next[userId]?.[optionId]?.id || "temp", value },
        };
      }
      return next;
    });

    try {
      const sendValue =
        value === false || (Array.isArray(value) && value.length === 0)
          ? null
          : value;

      const res = await fetch("/api/admin/selections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trip_id: tripId,
          user_id: userId,
          option_id: optionId,
          value: sendValue,
        }),
      });

      if (!res.ok) {
        console.error("Failed to save selection");
        // Refetch to revert
        const selRes = await fetch(`/api/admin/selections?trip_id=${tripId}`);
        const selData = await selRes.json();
        if (selData.selections) setSelections(selData.selections);
      }
    } catch (err) {
      console.error("Error saving selection", err);
    } finally {
      setSavingCells((prev) => {
        const next = new Set(prev);
        next.delete(cellKey);
        return next;
      });
    }
  };

  // ── Build grouped columns ──

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);

  const groupedOptions: { group: OptionGroup; options: TripOption[] }[] = sortedGroups.map((g) => ({
    group: g,
    options: options
      .filter((o) => o.group_id === g.id)
      .sort((a, b) => a.sort_order - b.sort_order),
  }));

  // Flat ordered options for row rendering
  const flatOptions = groupedOptions.flatMap((go) => go.options);

  // ── Render cell ──

  const renderCell = (userId: string, opt: TripOption) => {
    const cellKey = `${userId}:${opt.id}`;
    const saving = savingCells.has(cellKey);
    const sel = selections[userId]?.[opt.id];

    switch (opt.option_type) {
      case "checkbox":
        return (
          <CheckboxCell
            checked={sel?.value === true}
            saving={saving}
            onChange={(v) => saveSelection(userId, opt.id, v)}
          />
        );

      case "select":
        return (
          <SelectCell
            value={(sel?.value as string) || ""}
            choices={(opt.choices || []) as Choice[]}
            saving={saving}
            onChange={(v) => saveSelection(userId, opt.id, v)}
          />
        );

      case "multi_select":
        return (
          <MultiSelectCell
            selected={Array.isArray(sel?.value) ? (sel.value as string[]) : []}
            choices={(opt.choices || []) as Choice[]}
            saving={saving}
            onChange={(v) => saveSelection(userId, opt.id, v)}
          />
        );

      case "text":
        return (
          <TextCell
            value={(sel?.value as string) || ""}
            saving={saving}
            onChange={(v) => saveSelection(userId, opt.id, v)}
          />
        );

      case "number":
        return (
          <NumberCell
            value={sel?.value != null ? String(sel.value) : ""}
            saving={saving}
            onChange={(v) => saveSelection(userId, opt.id, v)}
          />
        );

      default:
        return null;
    }
  };

  // ── Summary row counts ──

  const getColumnSummary = (opt: TripOption) => {
    if (opt.option_type === "text") return null;

    if (opt.option_type === "number") {
      const values: number[] = [];
      for (const p of participants) {
        const sel = selections[p.user_id]?.[opt.id];
        if (sel?.value == null || sel.value === "") continue;
        const n = Number(sel.value);
        if (!Number.isNaN(n)) values.push(n);
      }
      if (values.length === 0) return null;
      const sum = values.reduce((a, b) => a + b, 0);
      const avg = sum / values.length;
      return (
        <div className="flex flex-col gap-0.5 items-center">
          <div className="whitespace-nowrap">
            Total: <span className="font-semibold text-gray-700">{sum.toLocaleString()}</span>
          </div>
          {values.length > 1 && (
            <div className="whitespace-nowrap">
              Avg: <span className="font-semibold text-gray-700">{avg.toFixed(avg % 1 === 0 ? 0 : 1)}</span>
            </div>
          )}
        </div>
      );
    }

    if (opt.option_type === "checkbox") {
      let count = 0;
      for (const p of participants) {
        const sel = selections[p.user_id]?.[opt.id];
        if (sel?.value === true) count++;
      }
      return `${count}/${participants.length}`;
    }

    // select / multi_select: per-choice counts
    const choices = (opt.choices || []) as Choice[];
    const counts = new Map<string, number>();
    for (const c of choices) counts.set(c.value, 0);

    for (const p of participants) {
      const sel = selections[p.user_id]?.[opt.id];
      if (!sel) continue;
      if (opt.option_type === "select") {
        const v = sel.value as string;
        if (v && counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
      } else if (opt.option_type === "multi_select") {
        const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
        for (const v of arr) {
          if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
        }
      }
    }

    const lines = choices
      .map((c) => ({ label: c.label, count: counts.get(c.value) ?? 0 }))
      .filter((x) => x.count > 0);

    if (lines.length === 0) return null;

    return (
      <div className="flex flex-col gap-0.5 items-center">
        {lines.map((l) => (
          <div key={l.label} className="whitespace-nowrap">
            {l.label}: <span className="font-semibold text-gray-700">{l.count}</span>
          </div>
        ))}
      </div>
    );
  };

  // ── Grand total ──

  const grandTotal = participants.reduce(
    (sum, p) => sum + calcLoozerCost(p.user_id, options, selections),
    0
  );

  // ── Loading state ──

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (participants.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No Loozers on the roster yet. Add participants first.
      </div>
    );
  }

  if (flatOptions.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No trip options configured yet. Create options first.
      </div>
    );
  }

  // ── Table ──

  return (
    <div className="overflow-x-auto border border-gray-200 rounded-2xl">
      <table className="min-w-full text-sm">
        {/* ── Group header row ── */}
        <thead>
          <tr>
            {/* Empty cell above sticky name column */}
            <th className="sticky left-0 z-20 bg-gray-50" />
            {groupedOptions.map((go) => (
              <th
                key={go.group.id}
                colSpan={go.options.length}
                className="bg-gray-50 px-3 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider text-center border-b border-gray-200"
              >
                {go.group.name}
              </th>
            ))}
            {/* Cost column group header */}
            <th className="bg-gray-50 px-3 py-2 border-b border-gray-200" />
          </tr>

          {/* ── Option header row ── */}
          <tr>
            <th className="sticky left-0 z-20 bg-gray-50 px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
              Loozer
            </th>
            {flatOptions.map((opt) => (
              <th
                key={opt.id}
                className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center whitespace-nowrap border-b border-gray-100"
              >
                <div>{opt.name}</div>
                {opt.cost ? (
                  <div className="text-[10px] text-gray-400 font-normal normal-case">
                    (${opt.cost})
                  </div>
                ) : null}
              </th>
            ))}
            <th className="bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right whitespace-nowrap border-b border-gray-100">
              Trip Cost
            </th>
          </tr>
        </thead>

        <tbody>
          {participants
            .sort((a, b) =>
              a.user.display_name.localeCompare(b.user.display_name)
            )
            .map((p) => {
              const cost = calcLoozerCost(p.user_id, options, selections);
              return (
                <tr key={p.user_id} className="hover:bg-gray-50/50">
                  {/* Sticky name column */}
                  <td className="sticky left-0 z-10 bg-white px-3 py-2 border-b border-gray-100 font-medium text-gray-900 whitespace-nowrap shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
                    {p.user.display_name}
                  </td>

                  {/* Option cells */}
                  {flatOptions.map((opt) => (
                    <td
                      key={opt.id}
                      className="px-3 py-2 border-b border-gray-100"
                    >
                      {renderCell(p.user_id, opt)}
                    </td>
                  ))}

                  {/* Cost cell */}
                  <td
                    className={`px-3 py-2 border-b border-gray-100 text-right whitespace-nowrap ${
                      cost > 0
                        ? "font-semibold text-gray-900"
                        : "text-gray-400"
                    }`}
                  >
                    {formatCost(cost)}
                  </td>
                </tr>
              );
            })}
        </tbody>

        {/* ── Summary footer ── */}
        <tfoot>
          <tr className="bg-gray-50">
            <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600 uppercase tracking-wider shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]">
              Totals
            </td>
            {flatOptions.map((opt) => {
              const summary = getColumnSummary(opt);
              return (
                <td
                  key={opt.id}
                  className="px-3 py-2 text-xs text-gray-500 text-center"
                >
                  {summary || ""}
                </td>
              );
            })}
            <td className="px-3 py-2 text-right font-semibold text-gray-900 whitespace-nowrap">
              {formatCost(grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
