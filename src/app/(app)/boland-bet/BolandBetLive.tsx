"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { BolandBet } from "@/lib/boland-bet/compute";

/**
 * Renders the Boland Bet standings and keeps them live: subscribes to Hole #1
 * writes on `kgb_cup_hole_scores` and re-fetches the computed standings on any
 * change (INSERT/UPDATE/DELETE). Falls back gracefully to the SSR snapshot.
 *
 * When the viewer can manage payouts (Pat Boland or an admin), each winning
 * line gets a persistent "Paid" checkbox to track who's been paid; nobody else
 * sees it.
 */
export function BolandBetLive({
  initialBet,
  initialCanManage,
}: {
  initialBet: BolandBet | null;
  initialCanManage: boolean;
}) {
  const [bet, setBet] = useState<BolandBet | null>(initialBet);
  const [canManage, setCanManage] = useState(initialCanManage);
  const [savingId, setSavingId] = useState<string | null>(null);
  const refetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const supabase = createClient();

    async function refetch() {
      try {
        const res = await fetch("/api/boland-bet");
        if (!res.ok) return;
        const data = await res.json();
        setBet(data.bet ?? null);
        setCanManage(!!data.canManage);
      } catch {
        // keep last-known standings on transient failure
      }
    }

    // Coalesce bursts of score writes into a single re-fetch.
    function scheduleRefetch() {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      refetchTimer.current = setTimeout(refetch, 400);
    }

    const channel = supabase
      .channel("boland-bet")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "kgb_cup_hole_scores", filter: "hole_number=eq.1" },
        scheduleRefetch
      )
      .subscribe();

    return () => {
      if (refetchTimer.current) clearTimeout(refetchTimer.current);
      supabase.removeChannel(channel);
    };
  }, []);

  async function togglePaid(userId: string, nextPaid: boolean) {
    // Optimistic flip; revert on failure.
    setBet((prev) =>
      prev
        ? {
            ...prev,
            lines: prev.lines.map((l) => (l.userId === userId ? { ...l, paid: nextPaid } : l)),
          }
        : prev
    );
    setSavingId(userId);
    try {
      const res = await fetch("/api/boland-bet/paid", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, paid: nextPaid }),
      });
      if (!res.ok) throw new Error("save failed");
    } catch {
      setBet((prev) =>
        prev
          ? {
              ...prev,
              lines: prev.lines.map((l) =>
                l.userId === userId ? { ...l, paid: !nextPaid } : l
              ),
            }
          : prev
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="px-4 pt-6 pb-8">
      <h1 className="text-2xl font-bold text-gray-900">Boland Bet</h1>
      <p className="text-sm text-gray-500 mt-1">
        Every player in the bet is on the line for their Hole&nbsp;#1 score in the KGB Cup
        {bet?.par != null ? ` (par ${bet.par})` : ""}. Par or better wins&nbsp;$10; bogey or worse
        and Boland keeps the&nbsp;$10 bet.
      </p>

      {!bet ? (
        <p className="text-gray-500 text-center py-12">
          Nobody has opted into the Boland Bet yet.
        </p>
      ) : (
        <div className="mt-5 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {/* Column header */}
          <div className="flex items-center gap-3 px-4 py-2 bg-gray-50 border-b border-gray-200 text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
            <span className="flex-1">Player</span>
            <span className="w-10 text-center">#1</span>
            <span className="w-16 text-right">Balance</span>
            {canManage && <span className="w-12 text-center">Paid</span>}
          </div>

          {/* Lines */}
          <div className="divide-y divide-gray-100">
            {bet.lines.map((line) => (
              <div key={line.userId} className="flex items-center gap-3 px-4 py-2.5">
                <span className="flex-1 min-w-0 truncate text-sm font-medium text-gray-800">
                  {line.displayName}
                </span>
                <span
                  className={`w-10 inline-flex items-center justify-center px-1.5 py-0.5 rounded-md text-sm font-semibold ${
                    line.result === "win"
                      ? "bg-green-100 text-green-700"
                      : line.result === "loss"
                        ? "bg-red-100 text-red-700"
                        : "bg-gray-100 text-gray-400"
                  }`}
                >
                  {line.score != null ? line.score : "–"}
                </span>
                <span
                  className={`w-16 text-right text-sm font-semibold tabular-nums ${
                    line.result === "win"
                      ? "text-green-700"
                      : line.result === "loss"
                        ? "text-red-600"
                        : "text-gray-400"
                  }`}
                >
                  {line.result === "win"
                    ? "+$10"
                    : line.result === "loss"
                      ? "−$10"
                      : "—"}
                </span>
                {canManage && (
                  <span className="w-12 flex items-center justify-center">
                    {line.result === "win" ? (
                      <input
                        type="checkbox"
                        checked={line.paid}
                        disabled={savingId === line.userId}
                        onChange={(e) => togglePaid(line.userId, e.target.checked)}
                        aria-label={`Mark ${line.displayName} paid`}
                        className="h-5 w-5 rounded border-gray-300 text-green-600 focus:ring-green-500 disabled:opacity-50"
                      />
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </span>
                )}
              </div>
            ))}
          </div>

          {/* Total */}
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-t border-gray-200">
            <span className="flex-1 text-sm font-bold text-gray-900">Total</span>
            <span className="w-10" />
            <span
              className={`w-16 text-right text-base font-bold tabular-nums ${
                bet.total > 0
                  ? "text-green-700"
                  : bet.total < 0
                    ? "text-red-600"
                    : "text-gray-500"
              }`}
            >
              {bet.total > 0 ? "+" : bet.total < 0 ? "−" : ""}${Math.abs(bet.total)}
            </span>
            {canManage && <span className="w-12" />}
          </div>
        </div>
      )}
    </div>
  );
}
