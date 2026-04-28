"use client";

import { useState, useEffect, useCallback } from "react";
import { downloadOptionsExcel } from "@/lib/options-export";

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
  option_type: "checkbox" | "select" | "multi_select" | "text" | "number" | "quantity";
  choices?: Choice[];
  cost?: number;
  is_required?: boolean;
  sort_order: number;
  max_total?: number | null;
}

interface Participant {
  user_id: string;
  user: {
    id: string;
    display_name: string;
    full_name: string | null;
    avatar_url: string | null;
  };
}

interface SelectionValue {
  id: string;
  value: unknown;
}

type SelectionsMap = Record<string, Record<string, SelectionValue>>;

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
      const matched = (opt.choices || []).find((c) => c.value === sel.value);
      if (matched?.cost) total += Number(matched.cost);
    } else if (opt.option_type === "multi_select") {
      const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
      for (const v of arr) {
        const matched = (opt.choices || []).find((c) => c.value === v);
        if (matched?.cost) total += Number(matched.cost);
      }
    }
  }
  return total;
}

function ChoiceBar({
  label,
  count,
  total,
}: {
  label: string;
  count: number;
  total: number;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span className="text-gray-700 truncate">{label}</span>
        <span className="font-semibold text-gray-900 tabular-nums shrink-0">
          {count}
        </span>
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
        <div
          className="h-full bg-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function CheckboxSummary({
  opt,
  participants,
  selections,
}: {
  opt: TripOption;
  participants: Participant[];
  selections: SelectionsMap;
}) {
  let yes = 0;
  for (const p of participants) {
    if (selections[p.user_id]?.[opt.id]?.value === true) yes++;
  }
  return <ChoiceBar label="Selected" count={yes} total={participants.length} />;
}

function ChoiceSummary({
  opt,
  participants,
  selections,
}: {
  opt: TripOption;
  participants: Participant[];
  selections: SelectionsMap;
}) {
  const counts = new Map<string, number>();
  for (const c of opt.choices || []) counts.set(c.value, 0);
  for (const p of participants) {
    const sel = selections[p.user_id]?.[opt.id];
    if (!sel) continue;
    if (opt.option_type === "select") {
      const v = sel.value as string;
      if (v && counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
    } else {
      const arr = Array.isArray(sel.value) ? (sel.value as string[]) : [];
      for (const v of arr) {
        if (counts.has(v)) counts.set(v, (counts.get(v) ?? 0) + 1);
      }
    }
  }
  const max = Math.max(1, ...Array.from(counts.values()));
  return (
    <div className="space-y-2.5">
      {(opt.choices || []).map((c) => (
        <ChoiceBar
          key={c.value}
          label={c.label}
          count={counts.get(c.value) ?? 0}
          total={max}
        />
      ))}
    </div>
  );
}

function QuantitySummary({
  opt,
  participants,
  selections,
}: {
  opt: TripOption;
  participants: Participant[];
  selections: SelectionsMap;
}) {
  const totals = new Map<string, number>();
  for (const c of opt.choices || []) totals.set(c.value, 0);
  let responders = 0;
  let grand = 0;
  for (const p of participants) {
    const v = selections[p.user_id]?.[opt.id]?.value;
    if (v === null || v === undefined || typeof v !== "object" || Array.isArray(v)) continue;
    // Any row (including explicit-zero {}) counts as a responder
    responders++;
    for (const [k, n] of Object.entries(v as Record<string, number>)) {
      const num = Number(n);
      if (!Number.isFinite(num) || num <= 0) continue;
      if (totals.has(k)) {
        totals.set(k, (totals.get(k) ?? 0) + num);
        grand += num;
      }
    }
  }
  const max = Math.max(1, ...Array.from(totals.values()));
  return (
    <div className="space-y-2.5">
      {(opt.choices || []).map((c) => (
        <ChoiceBar
          key={c.value}
          label={c.label}
          count={totals.get(c.value) ?? 0}
          total={max}
        />
      ))}
      <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-gray-100 text-xs">
        <span className="text-gray-500">
          {responders} {responders === 1 ? "responder" : "responders"}
          {opt.max_total != null && ` · cap ${opt.max_total}/person`}
        </span>
        <span className="font-semibold text-gray-700 tabular-nums">
          Total {grand.toLocaleString()}
        </span>
      </div>
    </div>
  );
}

function NumberSummary({
  opt,
  participants,
  selections,
}: {
  opt: TripOption;
  participants: Participant[];
  selections: SelectionsMap;
}) {
  const values: number[] = [];
  for (const p of participants) {
    const v = selections[p.user_id]?.[opt.id]?.value;
    const n = Number(v);
    if (Number.isFinite(n)) values.push(n);
  }
  if (values.length === 0) {
    return <p className="text-sm text-gray-400">No responses yet</p>;
  }
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  return (
    <div className="grid grid-cols-3 gap-2 text-center">
      <div>
        <div className="text-xs text-gray-500">Total</div>
        <div className="text-base font-semibold text-gray-900 tabular-nums">
          {sum.toLocaleString()}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500">Avg</div>
        <div className="text-base font-semibold text-gray-900 tabular-nums">
          {avg % 1 === 0 ? avg.toFixed(0) : avg.toFixed(1)}
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500">Resp.</div>
        <div className="text-base font-semibold text-gray-900 tabular-nums">
          {values.length}
        </div>
      </div>
    </div>
  );
}

function TextSummary({
  opt,
  participants,
  selections,
}: {
  opt: TripOption;
  participants: Participant[];
  selections: SelectionsMap;
}) {
  const responses: { name: string; text: string }[] = [];
  for (const p of participants) {
    const v = selections[p.user_id]?.[opt.id]?.value;
    if (typeof v === "string" && v.trim().length > 0) {
      responses.push({ name: p.user.display_name, text: v.trim() });
    }
  }
  const [expanded, setExpanded] = useState(false);
  if (responses.length === 0) {
    return <p className="text-sm text-gray-400">No responses yet</p>;
  }
  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="text-sm text-green-700 font-medium"
      >
        {responses.length} {responses.length === 1 ? "response" : "responses"}
        {expanded ? " — hide" : " — show"}
      </button>
      {expanded && (
        <ul className="mt-2 space-y-1.5">
          {responses.map((r, i) => (
            <li key={i} className="text-sm">
              <span className="font-medium text-gray-700">{r.name}:</span>{" "}
              <span className="text-gray-600">{r.text}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function SelectionSummary({
  tripId,
  onExportReady,
}: {
  tripId: string;
  onExportReady?: (exporter: (() => void) | null) => void;
}) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [options, setOptions] = useState<TripOption[]>([]);
  const [groups, setGroups] = useState<OptionGroup[]>([]);
  const [selections, setSelections] = useState<SelectionsMap>({});
  const [loading, setLoading] = useState(true);

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
      if (partData.users) {
        const participating = partData.users
          .filter((u: { is_participating: boolean }) => u.is_participating)
          .map(
            (u: {
              id: string;
              display_name: string;
              full_name: string | null;
              avatar_url: string | null;
            }) => ({
              user_id: u.id,
              user: {
                id: u.id,
                display_name: u.display_name,
                full_name: u.full_name,
                avatar_url: u.avatar_url,
              },
            })
          );
        setParticipants(participating);
      } else if (partData.participants) {
        setParticipants(partData.participants);
      }
      if (optData.options) setOptions(optData.options);
      if (groupData.groups) setGroups(groupData.groups);
      if (selData.selections) setSelections(selData.selections);
    } catch (err) {
      console.error("Failed to fetch summary data", err);
    } finally {
      setLoading(false);
    }
  }, [tripId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (!onExportReady) return;
    if (loading || participants.length === 0 || options.length === 0) {
      onExportReady(null);
      return;
    }
    const exporter = () => {
      downloadOptionsExcel({
        participants: participants.map((p) => ({
          user_id: p.user_id,
          display_name: p.user.display_name,
        })),
        options,
        groups,
        selections,
      });
    };
    onExportReady(exporter);
    return () => onExportReady(null);
  }, [onExportReady, loading, participants, options, groups, selections]);

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
        No Loozers on the roster yet.
      </div>
    );
  }
  if (options.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No trip options configured yet.
      </div>
    );
  }

  const sortedGroups = [...groups].sort((a, b) => a.sort_order - b.sort_order);
  const groupedOptions = sortedGroups
    .map((g) => ({
      group: g,
      options: options
        .filter((o) => o.group_id === g.id)
        .sort((a, b) => a.sort_order - b.sort_order),
    }))
    .filter((go) => go.options.length > 0);

  const ungrouped = options
    .filter((o) => !sortedGroups.some((g) => g.id === o.group_id))
    .sort((a, b) => a.sort_order - b.sort_order);

  const grandTotal = participants.reduce(
    (sum, p) => sum + calcLoozerCost(p.user_id, options, selections),
    0
  );
  const completeCount = participants.filter((p) => {
    const required = options.filter((o) => o.is_required);
    if (required.length === 0) return true;
    return required.every((o) => {
      const v = selections[p.user_id]?.[o.id]?.value;
      if (v === null || v === undefined || v === false) return false;
      if (Array.isArray(v) && v.length === 0) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      if (o.option_type === "quantity") {
        // {} (explicit zero) counts as answered — the row exists
        return v !== null && typeof v === "object" && !Array.isArray(v);
      }
      return true;
    });
  }).length;

  return (
    <div className="space-y-4">
      {/* Top stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Trip Total
          </div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums">
            ${grandTotal.toLocaleString()}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3">
          <div className="text-xs text-gray-500 uppercase tracking-wide">
            Completed
          </div>
          <div className="text-2xl font-bold text-gray-900 tabular-nums">
            {completeCount}
            <span className="text-sm text-gray-400 font-normal">
              {" "}
              / {participants.length}
            </span>
          </div>
        </div>
      </div>

      {/* Groups */}
      {groupedOptions.map((go) => (
        <section key={go.group.id} className="space-y-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-gray-500 px-1">
            {go.group.name}
          </h2>
          <div className="space-y-3">
            {go.options.map((opt) => (
              <OptionCard
                key={opt.id}
                opt={opt}
                participants={participants}
                selections={selections}
              />
            ))}
          </div>
        </section>
      ))}

      {ungrouped.length > 0 && (
        <section className="space-y-3">
          <div className="space-y-3">
            {ungrouped.map((opt) => (
              <OptionCard
                key={opt.id}
                opt={opt}
                participants={participants}
                selections={selections}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function OptionCard({
  opt,
  participants,
  selections,
}: {
  opt: TripOption;
  participants: Participant[];
  selections: SelectionsMap;
}) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="font-semibold text-gray-900 truncate">{opt.name}</h3>
        {opt.cost ? (
          <span className="text-sm font-semibold text-green-700 shrink-0">
            ${Number(opt.cost).toLocaleString()}
          </span>
        ) : null}
      </div>
      {opt.option_type === "checkbox" && (
        <CheckboxSummary opt={opt} participants={participants} selections={selections} />
      )}
      {(opt.option_type === "select" || opt.option_type === "multi_select") && (
        <ChoiceSummary opt={opt} participants={participants} selections={selections} />
      )}
      {opt.option_type === "number" && (
        <NumberSummary opt={opt} participants={participants} selections={selections} />
      )}
      {opt.option_type === "quantity" && (
        <QuantitySummary opt={opt} participants={participants} selections={selections} />
      )}
      {opt.option_type === "text" && (
        <TextSummary opt={opt} participants={participants} selections={selections} />
      )}
    </div>
  );
}
