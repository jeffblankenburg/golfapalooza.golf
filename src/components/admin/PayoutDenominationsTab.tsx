"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import { DragHandle } from "@/components/DragHandle";
import {
  ALL_DENOMS,
  effectiveSplitForRow,
  suggestExactDenoms,
  overrideToMap,
  mapToOverride,
  denomTarget,
  sumByDenom,
  totalFromDenom,
} from "@/lib/payout-events/denominations";
import type { PayoutSplit } from "@/lib/payout-events/splits";

interface Row {
  id: string;
  label: string;
  participant_source: string;
  amount_per_participant: number;
  day_count: number;
  participant_count: number;
  total: number;
  is_payout: boolean;
  notes: string | null;
  payout_splits: PayoutSplit[] | null;
  payee_count: number | null;
  denomination_override: Record<string, number> | null;
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

const STORAGE_KEY = "payout-denominations-prefs";

interface Prefs {
  excluded: number[];
  inHand: Record<number, number>;
}

function loadPrefs(): Prefs {
  if (typeof window === "undefined") return { excluded: [1], inHand: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { excluded: [1], inHand: {} };
    const parsed = JSON.parse(raw);
    return {
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [1],
      inHand: parsed.inHand && typeof parsed.inHand === "object" ? parsed.inHand : {},
    };
  } catch {
    return { excluded: [1], inHand: {} };
  }
}

function savePrefs(p: Prefs) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
}

export function PayoutDenominationsTab() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [editingId, setEditingId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/financials/payout-events");
    const data = await r.json();
    setRows(data.rows || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetchRows(); }, [fetchRows]);

  useEffect(() => { savePrefs(prefs); }, [prefs]);

  const allowedDenoms = useMemo(
    () => ALL_DENOMS.filter((d) => !prefs.excluded.includes(d)),
    [prefs.excluded],
  );

  // Persist a per-row change (payee_count / denomination_override) and merge
  // the server's re-projected row back into local state.
  const saveRow = useCallback(async (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r))); // optimistic
    const res = await fetch(`/api/admin/financials/payout-events/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (res.ok) {
      const { row } = await res.json();
      if (row) setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...row } : r)));
    } else {
      fetchRows(); // revert to server truth
    }
  }, [fetchRows]);

  // Only actual payouts belong on the cash sheet. Pass-through rows
  // (is_payout=false — money collected to cover an event, e.g. Lodge / KGB
  // entry) aren't paid out to a winner, so they're excluded here (they stay
  // on the payout-events editor).
  const payoutRows = useMemo(() => rows.filter((r) => r.is_payout), [rows]);

  const perRowSplit = useMemo(
    () =>
      payoutRows.map((r) => ({ row: r, eff: effectiveSplitForRow(r, allowedDenoms) })),
    [payoutRows, allowedDenoms],
  );

  const totalNeededByDenom = useMemo(
    () => sumByDenom(perRowSplit.map((p) => p.eff.map)),
    [perRowSplit],
  );

  // Grand total is the sum of the exact pots (what's actually owed), not the
  // billed sum — those match now except when a row can't be represented in the
  // enabled bills (shortfall), which we flag per-row.
  const grandTotal = useMemo(
    () => payoutRows.reduce((s, r) => s + r.total, 0),
    [payoutRows],
  );

  function toggleExcluded(d: number) {
    setPrefs((p) => ({
      ...p,
      excluded: p.excluded.includes(d)
        ? p.excluded.filter((x) => x !== d)
        : [...p.excluded, d],
    }));
  }

  function setInHand(d: number, n: number) {
    setPrefs((p) => ({ ...p, inHand: { ...p.inHand, [d]: n } }));
  }

  const editingRow = editingId ? rows.find((r) => r.id === editingId) ?? null : null;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (payoutRows.length === 0) {
    return (
      <div className="px-4 py-12 text-center text-sm text-gray-500">
        No payout events configured.{" "}
        <Link href="/admin/financials/payout-events" className="text-green-700 underline">
          Set them up first.
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4 print:space-y-2">
      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-500">
          Live totals.{" "}
          <Link href="/admin/financials/payout-events" className="text-green-700 underline">
            Edit rows
          </Link>
          .
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 active:bg-gray-200"
        >
          Print
        </button>
      </div>

      {/* Denomination toggles — apply to the auto suggestions (overrides use any bill). */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 print:hidden">
        <div className="text-[0.625rem] uppercase tracking-wider text-gray-500 mb-1.5">
          Include denominations (auto rows)
        </div>
        <div className="flex flex-wrap gap-1.5">
          {ALL_DENOMS.map((d) => {
            const on = !prefs.excluded.includes(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleExcluded(d)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                  on
                    ? "bg-green-50 text-green-700 border-green-300"
                    : "bg-gray-100 text-gray-400 border-gray-200 line-through"
                }`}
              >
                ${d}
              </button>
            );
          })}
        </div>
      </div>

      {/* Per-row breakdown */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Event</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Payees</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Bills</th>
            </tr>
          </thead>
          <tbody>
            {perRowSplit.map(({ row, eff }, i) => (
              <tr key={row.id} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
                <td className="px-3 py-2 border-b border-gray-100 align-top">
                  <div className="font-medium text-gray-900">{row.label}</div>
                  <div className="text-[0.625rem] text-gray-400 tabular-nums">
                    {row.participant_count} × {fmt(row.amount_per_participant)}
                    {row.day_count > 1 ? ` × ${row.day_count}d` : ""}
                    {row.payee_count && row.payee_count > 0
                      ? ` · ${fmt(denomTarget(row.total) / row.payee_count)}/payee`
                      : ""}
                  </div>
                </td>

                {/* Payee count — editable */}
                <td className="px-3 py-2 border-b border-gray-100 text-right align-top">
                  <input
                    type="number"
                    min={0}
                    defaultValue={row.payee_count ?? ""}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      const n = v === "" ? null : Math.max(1, Math.floor(Number(v) || 0));
                      if ((n ?? null) !== (row.payee_count ?? null)) {
                        // Changing payees invalidates a hand-picked mix — re-suggest.
                        saveRow(row.id, { payee_count: n, denomination_override: null });
                      }
                    }}
                    className="w-14 px-1.5 py-1 border border-gray-300 rounded text-sm tabular-nums text-right print:border-transparent"
                    placeholder="—"
                  />
                </td>

                {/* Total = exact pot */}
                <td className="px-3 py-2 border-b border-gray-100 text-right font-bold tabular-nums align-top">
                  {fmt(row.total)}
                  {eff.shortfall > 0 && (
                    <div className="text-[0.625rem] font-normal text-red-500">
                      bills {fmt(eff.shortfall)} short
                    </div>
                  )}
                </td>

                {/* Bills — tap to edit */}
                <td className="px-3 py-2 border-b border-gray-100 align-top">
                  <button
                    type="button"
                    onClick={() => setEditingId(row.id)}
                    className="w-full text-left group print:pointer-events-none"
                  >
                    {eff.map.size === 0 ? (
                      <span className="text-xs text-gray-300 group-active:text-gray-500">tap to set —</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 items-center">
                        {[...eff.map.entries()]
                          .sort((a, b) => b[0] - a[0])
                          .map(([denom, count]) => (
                            <span
                              key={denom}
                              className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[0.6875rem] font-semibold tabular-nums border ${
                                eff.isOverride
                                  ? "bg-blue-50 text-blue-700 border-blue-200"
                                  : "bg-green-50 text-green-700 border-green-200"
                              }`}
                            >
                              {count}×${denom}
                            </span>
                          ))}
                        <span className="text-[0.625rem] text-gray-400 print:hidden">✎</span>
                      </div>
                    )}
                  </button>
                </td>
              </tr>
            ))}

            <tr className="bg-gray-100 font-semibold border-t border-gray-300">
              <td className="px-3 py-2 text-xs uppercase tracking-wider text-gray-700">Total cash</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right text-base tabular-nums">{fmt(grandTotal)}</td>
              <td className="px-3 py-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cash inventory */}
      <div className="border border-gray-200 rounded-2xl overflow-hidden">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Denom</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider"># Needed</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">In hand</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">To get</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">$ value</th>
            </tr>
          </thead>
          <tbody>
            {ALL_DENOMS.map((d) => {
              const needed = totalNeededByDenom.get(d) || 0;
              const inHand = prefs.inHand[d] || 0;
              const diff = needed - inHand;
              return (
                <tr key={d} className={needed === 0 ? "opacity-40" : ""}>
                  <td className="px-3 py-2 border-b border-gray-100 font-semibold tabular-nums">${d}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums">
                    {needed || "0"}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right">
                    <input
                      type="number"
                      min={0}
                      value={inHand || ""}
                      onChange={(e) => setInHand(d, Number(e.target.value) || 0)}
                      className="w-16 px-2 py-1 border border-gray-300 rounded text-sm tabular-nums text-right print:border-transparent"
                      placeholder="0"
                    />
                  </td>
                  <td className={`px-3 py-2 border-b border-gray-100 text-right font-semibold tabular-nums ${
                    diff > 0 ? "text-red-600" : diff < 0 ? "text-gray-400" : "text-gray-300"
                  }`}>
                    {diff > 0 ? diff : diff < 0 ? `(${-diff} extra)` : "—"}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums text-gray-500">
                    {needed > 0 ? fmt(d * needed) : ""}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-gray-100 font-semibold border-t border-gray-300">
              <td className="px-3 py-2 text-xs uppercase tracking-wider text-gray-700">Bring</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {[...totalNeededByDenom.values()].reduce((a, b) => a + b, 0)} bills
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right tabular-nums">
                {fmt(totalFromDenom(totalNeededByDenom))}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {editingRow && (
        <DenominationEditor
          key={editingRow.id}
          row={editingRow}
          allowedDenoms={allowedDenoms}
          onClose={() => setEditingId(null)}
          onSave={(override) => {
            saveRow(editingRow.id, { denomination_override: override });
            setEditingId(null);
          }}
        />
      )}
    </div>
  );
}

/**
 * Per-row bill editor. Steppers for every denomination with a live
 * "selected vs pot" tally; Save is disabled until the bills sum to the row's
 * exact pot total. "Reset to suggested" reseeds the exact auto mix; "Use auto"
 * clears the override so the row follows the suggestion again.
 */
function DenominationEditor({
  row,
  allowedDenoms,
  onClose,
  onSave,
}: {
  row: Row;
  allowedDenoms: readonly number[];
  onClose: () => void;
  onSave: (override: Record<string, number> | null) => void;
}) {
  const target = denomTarget(row.total);
  const seed = () => {
    const existing = overrideToMap(row.denomination_override);
    return existing.size > 0
      ? existing
      : suggestExactDenoms(row.total, allowedDenoms, row.payee_count);
  };
  const [counts, setCounts] = useState<Map<number, number>>(seed);

  const selected = totalFromDenom(counts);
  const diff = target - selected;
  const matches = diff === 0;

  const setCount = (d: number, n: number) => {
    setCounts((prev) => {
      const next = new Map(prev);
      if (n <= 0) next.delete(d);
      else next.set(d, n);
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white rounded-t-3xl p-5 pb-8 animate-slide-up max-h-[85vh] overflow-y-auto">
        <DragHandle onClose={onClose} className="mb-3" />
        <h2 className="text-lg font-bold text-gray-900">{row.label}</h2>
        <p className="text-xs text-gray-500 mb-4">
          Pot {fmt(row.total)}
          {row.payee_count && row.payee_count > 0
            ? ` · ${row.payee_count} payees · ${fmt(target / row.payee_count)}/payee`
            : ""}
          . Bills must total {fmt(target)}.
        </p>

        <div className="space-y-2">
          {ALL_DENOMS.map((d) => {
            const c = counts.get(d) || 0;
            return (
              <div key={d} className="flex items-center gap-3">
                <span className="w-12 font-semibold tabular-nums text-gray-800">${d}</span>
                <button
                  type="button"
                  onClick={() => setCount(d, Math.max(0, c - 1))}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 text-lg font-bold active:bg-gray-200 disabled:opacity-30"
                  disabled={c === 0}
                  aria-label={`One less $${d}`}
                >
                  −
                </button>
                <input
                  type="number"
                  min={0}
                  value={c || ""}
                  onChange={(e) => setCount(d, Math.max(0, Math.floor(Number(e.target.value) || 0)))}
                  className="w-16 px-2 py-1.5 border border-gray-300 rounded text-center text-sm tabular-nums"
                  placeholder="0"
                />
                <button
                  type="button"
                  onClick={() => setCount(d, c + 1)}
                  className="w-9 h-9 flex items-center justify-center rounded-full bg-gray-100 text-gray-700 text-lg font-bold active:bg-gray-200"
                  aria-label={`One more $${d}`}
                >
                  +
                </button>
                <span className="flex-1 text-right text-xs text-gray-400 tabular-nums">
                  {c > 0 ? fmt(c * d) : ""}
                </span>
              </div>
            );
          })}
        </div>

        {/* Running tally */}
        <div
          className={`mt-4 flex items-center justify-between rounded-xl border px-3 py-2 text-sm tabular-nums ${
            matches ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"
          }`}
        >
          <span className="text-gray-500">Selected</span>
          <span className={`font-bold ${matches ? "text-green-700" : "text-red-600"}`}>
            {fmt(selected)}
            <span className="text-gray-400 font-normal">
              {" / "}{fmt(target)}
            </span>
            {!matches && (
              <span className="ml-2 text-xs font-semibold text-red-600">
                {diff > 0 ? `${fmt(diff)} short` : `${fmt(-diff)} over`}
              </span>
            )}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => onSave(mapToOverride(counts))}
            disabled={!matches}
            className="flex-1 min-w-[8rem] py-3 rounded-xl font-semibold text-white bg-green-600 active:scale-95 transition-transform disabled:opacity-40 disabled:active:scale-100"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => setCounts(suggestExactDenoms(row.total, allowedDenoms, row.payee_count))}
            className="px-4 py-3 rounded-xl font-semibold text-gray-700 bg-gray-100 active:bg-gray-200"
          >
            Reset to suggested
          </button>
          {row.denomination_override && (
            <button
              type="button"
              onClick={() => onSave(null)}
              className="px-4 py-3 rounded-xl font-semibold text-red-600 bg-red-50 active:bg-red-100"
            >
              Use auto
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
