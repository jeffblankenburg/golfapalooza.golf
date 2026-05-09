"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import Link from "next/link";

interface Loozer {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
}

interface GridEvent {
  key: string;
  label: string;
  sort_order: number;
  total: number;
  pickem: boolean;
}

interface GridCell {
  user_id: string;
  event_key: string;
  amount: number;
  paid: boolean;
}

interface GridData {
  trip_id: string;
  loozers: Loozer[];
  events: GridEvent[];
  cells: GridCell[];
}

interface PickemContext {
  [eventKey: string]: string; // event_key → pickem_contest_id
}

const fmt = (n: number) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: n % 1 === 0 ? 0 : 2,
  });

export function PayoutWinnersTab() {
  const [data, setData] = useState<GridData | null>(null);
  const [pickemCtx, setPickemCtx] = useState<PickemContext>({});
  const [loading, setLoading] = useState(true);
  const [showEmpty, setShowEmpty] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/admin/financials/payout-grid");
    const d = await r.json();
    setData(d);

    // Pickem cells need contest_id in their PUT — fetch the events config to map.
    const cfg = await fetch("/api/admin/financials/payout-events");
    const cd = await cfg.json();
    const map: PickemContext = {};
    for (const row of cd.rows || []) {
      if (row.participant_source === "pickem_payments" && row.source_ref) {
        map[row.id] = row.source_ref;
      }
    }
    setPickemCtx(map);
    setLoading(false);
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const cellMap = useMemo(() => {
    const m = new Map<string, GridCell>();
    for (const c of data?.cells || []) m.set(`${c.user_id}|${c.event_key}`, c);
    return m;
  }, [data]);

  const visibleLoozers = useMemo(() => {
    if (!data) return [];
    if (showEmpty) return data.loozers;
    const winners = new Set((data.cells || []).map((c) => c.user_id));
    return data.loozers.filter((l) => winners.has(l.user_id));
  }, [data, showEmpty]);

  const rowTotals = useMemo(() => {
    const m = new Map<string, { total: number; unpaid: number }>();
    for (const c of data?.cells || []) {
      const cur = m.get(c.user_id) || { total: 0, unpaid: 0 };
      cur.total += c.amount;
      if (!c.paid) cur.unpaid += c.amount;
      m.set(c.user_id, cur);
    }
    return m;
  }, [data]);

  async function togglePaid(cell: GridCell) {
    if (!data) return;
    const next = !cell.paid;
    // Optimistic update
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        cells: prev.cells.map((c) =>
          c.user_id === cell.user_id && c.event_key === cell.event_key ? { ...c, paid: next } : c,
        ),
      };
    });

    const body: Record<string, unknown> = {
      trip_id: data.trip_id,
      user_id: cell.user_id,
      event_key: cell.event_key,
      paid: next,
    };
    if (pickemCtx[cell.event_key]) body.pickem_contest_id = pickemCtx[cell.event_key];

    const r = await fetch("/api/admin/financials/payout-grid/cell", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      // Revert on failure
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          cells: prev.cells.map((c) =>
            c.user_id === cell.user_id && c.event_key === cell.event_key ? { ...c, paid: cell.paid } : c,
          ),
        };
      });
      const err = await r.json().catch(() => ({}));
      setErrorMsg(err.error || "Save failed");
    } else {
      setErrorMsg(null);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data || data.events.length === 0) {
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
    <div className="space-y-3">
      {errorMsg && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-3 py-2 flex items-start justify-between gap-2">
          <span>{errorMsg}</span>
          <button type="button" onClick={() => setErrorMsg(null)} className="text-red-600 underline">dismiss</button>
        </div>
      )}

      <div className="flex items-center justify-between print:hidden">
        <p className="text-sm text-gray-500">
          Winners read from existing scoring data. Tap a cell to mark paid.
        </p>
        <label className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(e) => setShowEmpty(e.target.checked)}
          />
          Show non-winners
        </label>
      </div>

      <div className="overflow-x-auto border border-gray-200 rounded-2xl">
        <table className="text-xs border-collapse">
          <thead>
            <tr className="bg-gray-50">
              <th
                className="sticky left-0 z-10 bg-gray-50 px-2 py-2 text-left font-semibold text-gray-600 uppercase tracking-wider border-r border-gray-200 min-w-[140px]"
              >
                Loozer
              </th>
              {data.events.map((ev) => (
                <th
                  key={ev.key}
                  className="px-2 py-2 text-center font-semibold text-gray-600 uppercase tracking-wider min-w-[80px] border-r border-gray-100"
                >
                  <div>{ev.label}</div>
                  <div className="text-[10px] font-normal text-gray-400 normal-case tabular-nums">
                    {fmt(ev.total)}
                  </div>
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold text-gray-600 uppercase tracking-wider min-w-[80px]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleLoozers.length === 0 ? (
              <tr>
                <td colSpan={data.events.length + 2} className="px-3 py-8 text-center text-gray-400">
                  No winners yet — toggle &ldquo;Show non-winners&rdquo; to see all attendees.
                </td>
              </tr>
            ) : (
              visibleLoozers.map((l, rowIdx) => {
                const rt = rowTotals.get(l.user_id);
                return (
                  <tr key={l.user_id} className={rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}>
                    <td className={`sticky left-0 z-[1] px-2 py-1.5 border-r border-gray-200 font-medium text-gray-900 whitespace-nowrap ${rowIdx % 2 === 0 ? "bg-white" : "bg-gray-50/30"}`}>
                      <div className="flex items-center gap-1.5">
                        {l.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={l.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[9px] font-bold">
                            {l.display_name[0].toUpperCase()}
                          </span>
                        )}
                        <span>{l.display_name}</span>
                      </div>
                    </td>
                    {data.events.map((ev) => {
                      const cell = cellMap.get(`${l.user_id}|${ev.key}`);
                      if (!cell) {
                        return <td key={ev.key} className="px-2 py-1.5 border-r border-gray-100 text-center text-gray-200">—</td>;
                      }
                      return (
                        <td
                          key={ev.key}
                          className={`px-2 py-1.5 border-r border-gray-100 text-center cursor-pointer transition-colors ${
                            cell.paid ? "bg-gray-100 text-gray-400" : "bg-green-50 text-green-700 hover:bg-green-100"
                          }`}
                          onClick={() => togglePaid(cell)}
                        >
                          <div className="flex items-center justify-center gap-1">
                            {cell.paid && (
                              <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                            <span className={`font-semibold tabular-nums ${cell.paid ? "line-through" : ""}`}>
                              {fmt(cell.amount)}
                            </span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      <div className="font-bold text-gray-900">{fmt(rt?.total ?? 0)}</div>
                      {rt && rt.unpaid > 0 && rt.unpaid !== rt.total && (
                        <div className="text-[10px] text-amber-600">{fmt(rt.unpaid)} owed</div>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
          <tfoot>
            <tr className="bg-gray-100 border-t border-gray-300 font-semibold">
              <td className="sticky left-0 z-10 bg-gray-100 px-2 py-2 border-r border-gray-200 text-xs uppercase tracking-wider text-gray-700">
                Column total
              </td>
              {data.events.map((ev) => (
                <td key={ev.key} className="px-2 py-2 text-center tabular-nums border-r border-gray-200">
                  {fmt(ev.total)}
                </td>
              ))}
              <td className="px-2 py-2 text-right tabular-nums">
                {fmt(data.events.reduce((s, e) => s + e.total, 0))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
