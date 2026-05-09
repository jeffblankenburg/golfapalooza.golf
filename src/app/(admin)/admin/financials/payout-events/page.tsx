"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { BTN_BACK, BTN_PRIMARY, BTN_DESTRUCTIVE } from "@/lib/ui/buttons";
import { ConfirmModal } from "@/components/admin/ConfirmModal";

type Source =
  | "option"
  | "option_value"
  | "scramble"
  | "all_attendees"
  | "pickem_payments"
  | "manual";

type WinnerSource =
  | "scramble_team"
  | "scramble_skins"
  | "ctp_front"
  | "ctp_back"
  | "long_drive"
  | "long_putt"
  | "hundred_feet"
  | "pickem"
  | "none";

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
  winner_source: WinnerSource | null;
  winner_day_number: number | null;
  notes: string | null;
  participant_count: number;
  total: number;
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
}

const SOURCE_LABELS: Record<Source, string> = {
  option: "Option (any yes-cost)",
  option_value: "Option — specific choice values",
  scramble: "Scramble participants",
  all_attendees: "All attendees",
  pickem_payments: "Pick'em (paid)",
  manual: "Manual count",
};

const WINNER_SOURCE_LABELS: Record<WinnerSource, string> = {
  scramble_team: "Scramble team (gross score top 2)",
  scramble_skins: "Skins (computed)",
  ctp_front: "Closest to Pin — Front",
  ctp_back: "Closest to Pin — Back",
  long_drive: "Long Drive",
  long_putt: "Long Putt",
  hundred_feet: "100 Feet (lowest total)",
  pickem: "Pick'em rankings",
  none: "None — pass-through cash",
};

const WINNER_NEEDS_DAY: Set<WinnerSource> = new Set([
  "ctp_front",
  "ctp_back",
  "long_drive",
  "long_putt",
]);

const fmt = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n % 1 === 0 ? 0 : 2 });

export default function PayoutEventsAdminPage() {
  const router = useRouter();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<OptionRef[]>([]);
  const [contests, setContests] = useState<ContestRef[]>([]);
  const [tripId, setTripId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Row | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

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
      const [optsRes, contestsRes] = await Promise.all([
        fetch(`/api/admin/options?trip_id=${data.trip_id}`).catch(() => null),
        fetch(`/api/admin/contests?trip_id=${data.trip_id}`).catch(() => null),
      ]);
      if (optsRes && optsRes.ok) {
        const od = await optsRes.json();
        setOptions(od.options || od.trip_options || []);
      }
      if (contestsRes && contestsRes.ok) {
        const cd = await contestsRes.json();
        setContests(cd.contests || []);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (allowed) fetchAll();
  }, [allowed, fetchAll]);

  async function patchRow(id: string, patch: Partial<Row>) {
    const r = await fetch(`/api/admin/financials/payout-events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      setErrorMsg(err.error || "Save failed");
      return;
    }
    setErrorMsg(null);
    await fetchAll();
  }

  async function addRow() {
    if (!tripId) return;
    const sortMax = rows.reduce((m, r) => Math.max(m, r.sort_order), 0);
    const r = await fetch("/api/admin/financials/payout-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trip_id: tripId,
        label: "New event",
        sort_order: sortMax + 10,
        participant_source: "manual",
        amount_per_participant: 0,
        day_count: 1,
        is_payout: true,
      }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      setErrorMsg(err.error || "Create failed");
      return;
    }
    setErrorMsg(null);
    await fetchAll();
  }

  async function deleteRow(id: string) {
    const r = await fetch(`/api/admin/financials/payout-events/${id}`, { method: "DELETE" });
    if (!r.ok) { setErrorMsg("Delete failed"); return; }
    setErrorMsg(null);
    setConfirmDelete(null);
    await fetchAll();
  }

  if (!allowed) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const grandTotal = rows.reduce((s, r) => s + (r.total || 0), 0);

  return (
    <div className="px-4 pt-6 pb-8 space-y-4">
      <Link href="/admin/financials" className={BTN_BACK}>← Financials</Link>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Payout Events</h1>
        <button type="button" onClick={addRow} className={BTN_PRIMARY}>+ Add row</button>
      </div>
      <p className="text-sm text-gray-500">
        Defines the columns of the cash-needed sheet. Live totals reflect current
        option selections, scramble rosters, and Pick&apos;em payment status.
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
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">
          No rows yet. Run <code className="px-1 bg-gray-100 rounded">node scripts/seed-payout-sheet-events.mjs</code> to populate.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <RowCard
              key={row.id}
              row={row}
              options={options}
              contests={contests}
              onPatch={(patch) => patchRow(row.id, patch)}
              onDelete={() => setConfirmDelete(row)}
            />
          ))}

          <div className="flex justify-end px-2 py-3 border-t border-gray-200 mt-2">
            <span className="text-sm text-gray-500 mr-2">Grand total:</span>
            <span className="text-lg font-bold text-gray-900 tabular-nums">{fmt(grandTotal)}</span>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmModal
          open
          title={`Delete "${confirmDelete.label}"?`}
          message="This row is removed from every payout view."
          confirmLabel="Delete"
          destructive
          onConfirm={() => deleteRow(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

function RowCard({
  row,
  options,
  contests,
  onPatch,
  onDelete,
}: {
  row: Row;
  options: OptionRef[];
  contests: ContestRef[];
  onPatch: (patch: Partial<Row>) => void | Promise<void>;
  onDelete: () => void;
}) {
  const [label, setLabel] = useState(row.label);
  const [amount, setAmount] = useState(String(row.amount_per_participant));
  const [days, setDays] = useState(String(row.day_count));
  const [sortOrder, setSortOrder] = useState(String(row.sort_order));
  const [notes, setNotes] = useState(row.notes || "");

  const src = row.participant_source;
  const sourceOptions: Array<[Source, string]> = (Object.entries(SOURCE_LABELS) as Array<[Source, string]>);

  const sourceRefPicker = (() => {
    if (src === "option" || src === "option_value") {
      return (
        <select
          value={row.source_ref || ""}
          onChange={(e) => onPatch({ source_ref: e.target.value || null })}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.name}</option>
          ))}
        </select>
      );
    }
    if (src === "scramble") {
      return (
        <select
          value={row.source_ref || ""}
          onChange={(e) => onPatch({ source_ref: e.target.value || null })}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">—</option>
          {contests.filter((c) => c.contest_type === "scramble").map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    if (src === "pickem_payments") {
      return (
        <select
          value={row.source_ref || ""}
          onChange={(e) => onPatch({ source_ref: e.target.value || null })}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
        >
          <option value="">—</option>
          {contests.filter((c) => c.contest_type === "pickem").map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      );
    }
    return null;
  })();

  const filterEditor = (() => {
    if (src === "option_value") {
      const opt = options.find((o) => o.id === row.source_ref);
      const selected = new Set(row.source_filter?.choice_values || []);
      return (
        <div className="flex flex-wrap gap-1.5">
          {(opt?.choices || []).map((ch) => (
            <label key={ch.value} className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-gray-50 rounded border border-gray-200">
              <input
                type="checkbox"
                checked={selected.has(ch.value)}
                onChange={(e) => {
                  const next = new Set(selected);
                  if (e.target.checked) next.add(ch.value); else next.delete(ch.value);
                  onPatch({ source_filter: { choice_values: [...next] } });
                }}
              />
              {ch.label}
            </label>
          ))}
          {!opt && <span className="text-xs text-gray-400">Pick an option above first.</span>}
        </div>
      );
    }
    if (src === "manual") {
      return (
        <input
          type="number"
          min={0}
          value={row.source_filter?.count ?? 0}
          onChange={(e) => onPatch({ source_filter: { count: Number(e.target.value) || 0 } })}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm w-24"
          placeholder="count"
        />
      );
    }
    return null;
  })();

  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onBlur={() => label !== row.label && onPatch({ label })}
            className="w-full text-base font-bold text-gray-900 border-b border-transparent focus:border-gray-300 focus:outline-none"
          />
          <p className="text-[11px] text-gray-400 mt-0.5">
            {row.participant_count} × {fmt(row.amount_per_participant)} × {row.day_count} day{row.day_count !== 1 ? "s" : ""} = <span className="font-semibold text-gray-900">{fmt(row.total)}</span>
            {!row.is_payout && <span className="ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 uppercase tracking-wide">pass-through</span>}
          </p>
        </div>
        <button type="button" onClick={onDelete} className={BTN_DESTRUCTIVE}>Delete</button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        <label className="flex flex-col">
          <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">$/Person</span>
          <input
            type="number"
            step="0.01"
            min={0}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            onBlur={() => Number(amount) !== row.amount_per_participant && onPatch({ amount_per_participant: Number(amount) || 0 })}
            className="border border-gray-300 rounded-md px-2 py-1 bg-white"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Days</span>
          <input
            type="number"
            min={1}
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onBlur={() => Number(days) !== row.day_count && onPatch({ day_count: Number(days) || 1 })}
            className="border border-gray-300 rounded-md px-2 py-1 bg-white"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Sort</span>
          <input
            type="number"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            onBlur={() => Number(sortOrder) !== row.sort_order && onPatch({ sort_order: Number(sortOrder) || 0 })}
            className="border border-gray-300 rounded-md px-2 py-1 bg-white"
          />
        </label>
        <label className="flex flex-col">
          <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Type</span>
          <select
            value={row.is_payout ? "payout" : "passthrough"}
            onChange={(e) => onPatch({ is_payout: e.target.value === "payout" })}
            className="border border-gray-300 rounded-md px-2 py-1 bg-white"
          >
            <option value="payout">Payout</option>
            <option value="passthrough">Pass-through</option>
          </select>
        </label>
      </div>

      <div className="space-y-1.5">
        <span className="text-gray-500 uppercase tracking-wide text-[10px]">Participant source</span>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={src}
            onChange={(e) => onPatch({ participant_source: e.target.value as Source, source_ref: null, source_filter: null })}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
          >
            {sourceOptions.map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {sourceRefPicker}
        </div>
        {filterEditor && <div className="mt-1.5">{filterEditor}</div>}
      </div>

      <div className="space-y-1.5">
        <span className="text-gray-500 uppercase tracking-wide text-[10px]">Winner source</span>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={row.winner_source ?? "none"}
            onChange={(e) => {
              const next = e.target.value as WinnerSource;
              const patch: Partial<Row> = { winner_source: next };
              if (!WINNER_NEEDS_DAY.has(next)) patch.winner_day_number = null;
              onPatch(patch);
            }}
            className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
          >
            {(Object.entries(WINNER_SOURCE_LABELS) as Array<[WinnerSource, string]>).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          {row.winner_source && WINNER_NEEDS_DAY.has(row.winner_source) && (
            <select
              value={row.winner_day_number ?? ""}
              onChange={(e) => onPatch({ winner_day_number: e.target.value ? Number(e.target.value) : null })}
              className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
            >
              <option value="">— pick day —</option>
              <option value="2">Thursday (day 2)</option>
              <option value="3">Friday (day 3)</option>
              <option value="4">Saturday (day 4)</option>
            </select>
          )}
        </div>
      </div>

      <label className="flex flex-col">
        <span className="text-gray-500 uppercase tracking-wide text-[10px] mb-0.5">Notes</span>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => notes !== (row.notes || "") && onPatch({ notes: notes || null })}
          className="border border-gray-300 rounded-md px-2 py-1 text-sm bg-white"
          placeholder="(optional)"
        />
      </label>
    </div>
  );
}
