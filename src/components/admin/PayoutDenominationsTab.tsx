"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";
import {
  ALL_DENOMS,
  splitForRow,
  classifyForDenoms,
  sumByDenom,
  totalFromDenom,
  DEFAULT_TEAM_SIZE,
  SCRAMBLE_2ND_PLACE_AMOUNT,
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
  if (typeof window === "undefined") return { excluded: [2, 1], inHand: {} };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { excluded: [2, 1], inHand: {} };
    const parsed = JSON.parse(raw);
    return {
      excluded: Array.isArray(parsed.excluded) ? parsed.excluded : [2, 1],
      inHand: parsed.inHand && typeof parsed.inHand === "object" ? parsed.inHand : {},
    };
  } catch {
    return { excluded: [2, 1], inHand: {} };
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

  const perRowSplit = useMemo(
    () => rows.map((r) => ({ row: r, split: splitForRow(r, allowedDenoms) })),
    [rows, allowedDenoms],
  );

  const totalNeededByDenom = useMemo(
    () => sumByDenom(perRowSplit.map((p) => p.split)),
    [perRowSplit],
  );

  const grandTotal = useMemo(
    () => rows.reduce((s, r) => s + r.total, 0),
    [rows],
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

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (rows.length === 0) {
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

      {/* Denomination toggles */}
      <div className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 print:hidden">
        <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
          Include denominations
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
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Math</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Total</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Bills</th>
            </tr>
          </thead>
          <tbody>
            {perRowSplit.map(({ row, split }, i) => (
              <tr
                key={row.id}
                className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
              >
                <td className="px-3 py-2 border-b border-gray-100 align-top">
                  <div className="font-medium text-gray-900">{row.label}</div>
                  <StrategyHint row={row} />
                  {!row.is_payout && (
                    <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] uppercase tracking-wide">
                      pass-through
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 border-b border-gray-100 text-right text-xs text-gray-500 tabular-nums whitespace-nowrap">
                  {row.participant_count} × {fmt(row.amount_per_participant)}
                  {row.day_count > 1 ? ` × ${row.day_count}d` : ""}
                </td>
                <td className="px-3 py-2 border-b border-gray-100 text-right font-bold tabular-nums">
                  {fmt(row.total)}
                </td>
                <td className="px-3 py-2 border-b border-gray-100">
                  {split.size === 0 ? (
                    <span className="text-xs text-gray-300">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {[...split.entries()]
                        .sort((a, b) => b[0] - a[0])
                        .map(([denom, count]) => (
                          <span
                            key={denom}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-50 text-green-700 text-[11px] font-semibold tabular-nums border border-green-200"
                          >
                            {count}×${denom}
                          </span>
                        ))}
                    </div>
                  )}
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
              const excluded = prefs.excluded.includes(d);
              return (
                <tr key={d} className={excluded ? "opacity-40" : ""}>
                  <td className="px-3 py-2 border-b border-gray-100 font-semibold tabular-nums">${d}</td>
                  <td className="px-3 py-2 border-b border-gray-100 text-right tabular-nums">
                    {needed || (excluded ? "—" : "0")}
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
    </div>
  );
}

function StrategyHint({ row }: { row: Row }) {
  const kind = classifyForDenoms(row);
  if (kind === "scramble_team") {
    const second = SCRAMBLE_2ND_PLACE_AMOUNT;
    const first = Math.max(0, row.total - second);
    const perFirst = first / DEFAULT_TEAM_SIZE;
    const perSecond = second / DEFAULT_TEAM_SIZE;
    return (
      <div className="text-[10px] text-gray-400 mt-0.5">
        1st {fmt(first)} ÷ {DEFAULT_TEAM_SIZE} = {fmt(perFirst)}/ea · 2nd {fmt(second)} ÷ {DEFAULT_TEAM_SIZE} = {fmt(perSecond)}/ea
      </div>
    );
  }
  if (kind === "scramble_skins") {
    return <div className="text-[10px] text-gray-400 mt-0.5">small-bill mix (half $5, half $10) for unpredictable shares</div>;
  }
  if (kind === "ctp" || kind === "long_drive" || kind === "long_putt") {
    if (row.day_count > 1) {
      return <div className="text-[10px] text-gray-400 mt-0.5">{fmt(row.total / row.day_count)} per day × {row.day_count}</div>;
    }
  }
  return null;
}
