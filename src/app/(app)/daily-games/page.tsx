import { getAuthUser } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { redirect } from "next/navigation";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { AutoRefresh } from "@/components/AutoRefresh";
import { getEffectiveDate, getEffectiveTripId } from "@/lib/simulator";
import { isFeatureVisible } from "@/lib/visibility";
import {
  allocateCtpDailyPots,
  allocateLongDrivePots,
  type DailyContestAllocation,
  type DailyContestInput,
} from "@/lib/winners/daily-pots";

export { zoomableViewport as viewport } from "@/lib/viewport";

export default async function DailyGamesPage() {
  const user = await getAuthUser();

  if (!user) redirect("/login");

  const adminClient = createAdminClient();
  const { data: trip } = await adminClient
    .from("trip_settings")
    .select("id, start_date, visibility_overrides")
    .eq("id", (await getEffectiveTripId())!)
    .single();

  if (!trip) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>
        <p className="text-gray-500 text-center py-8">No active event.</p>
      </div>
    );
  }

  const now = await getEffectiveDate();
  if (!isFeatureVisible("daily_games", { start_date: trip.start_date, visibility_overrides: (trip.visibility_overrides as Record<string, boolean>) || {} }, now)) {
    return (
      <div className="px-4 pt-6">
        <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>
        <p className="text-gray-500 text-center py-8">Daily game results will be available once the event begins.</p>
      </div>
    );
  }

  // Issue #125 follow-up: per-day daily contests carry pots forward
  // when nobody wins (CTP both sides, LD). We pull every per-day
  // contest with its declared_no_winner flag + winner + base-pot
  // ingredients (cost item + participant count), then run the carry
  // allocator to get the adjusted pot per contest.
  const [dailyContestsResult, eventDaysResult, participantsResult] = await Promise.all([
    adminClient
      .from("contests")
      .select(
        "id, day_number, contest_type, declared_no_winner, contest_winners(user_id, user:users!contest_winners_user_id_fkey(display_name, avatar_url)), buy_in_cost_item:cost_items!contests_buy_in_cost_item_id_fkey(cost)",
      )
      .eq("trip_id", trip.id)
      .in("contest_type", ["ctp_front", "ctp_back", "long_drive", "long_putt"])
      .not("day_number", "is", null),
    adminClient
      .from("contests")
      .select("day_number")
      .eq("trip_id", trip.id)
      .eq("contest_type", "scramble")
      .not("day_number", "is", null)
      .order("day_number"),
    adminClient
      .from("contest_participants")
      .select("contest_id, contests:contests!inner(trip_id)")
      .eq("contests.trip_id", trip.id),
  ]);

  type DailyContestRow = {
    id: string;
    day_number: number;
    contest_type: string;
    declared_no_winner: boolean;
    contest_winners: Array<{
      user_id: string;
      user: { display_name: string; avatar_url: string | null } | { display_name: string; avatar_url: string | null }[] | null;
    }> | null;
    buy_in_cost_item: { cost: number | string } | { cost: number | string }[] | null;
  };
  const contests = ((dailyContestsResult.data ?? []) as DailyContestRow[]).filter(
    (c) => c.day_number != null,
  );

  // Participant counts per contest (batched).
  const partCounts = new Map<string, number>();
  for (const p of (participantsResult.data ?? []) as Array<{ contest_id: string }>) {
    partCounts.set(p.contest_id, (partCounts.get(p.contest_id) ?? 0) + 1);
  }

  const toInput = (c: DailyContestRow, side: "front" | "back" | "ld"): DailyContestInput => {
    const ci = Array.isArray(c.buy_in_cost_item) ? c.buy_in_cost_item[0] : c.buy_in_cost_item;
    const perPerson = Number((ci as { cost?: number | string } | null)?.cost ?? 0);
    const count = partCounts.get(c.id) ?? 0;
    const cw = c.contest_winners ?? [];
    return {
      id: c.id,
      day_number: c.day_number,
      side,
      base_pot: Math.round(perPerson * count * 100) / 100,
      has_winner: cw.length > 0 && !c.declared_no_winner,
      declared_no_winner: c.declared_no_winner,
    };
  };

  const ctpInputs = contests
    .filter((c) => c.contest_type === "ctp_front" || c.contest_type === "ctp_back")
    .map((c) => toInput(c, c.contest_type === "ctp_front" ? "front" : "back"));
  const ldInputs = contests
    .filter((c) => c.contest_type === "long_drive")
    .map((c) => toInput(c, "ld"));

  const ctpAlloc = allocateCtpDailyPots(ctpInputs);
  const ldAlloc = allocateLongDrivePots(ldInputs);
  const allocById = new Map<string, DailyContestAllocation>();
  for (const a of ctpAlloc) allocById.set(a.id, a);
  for (const a of ldAlloc) allocById.set(a.id, a);

  // Long Putt has no carry chain (always has a winner). Its display pot
  // is just base_pot. We synthesize an allocation entry so the render
  // loop can read it the same way.
  for (const c of contests) {
    if (c.contest_type !== "long_putt") continue;
    const input = toInput(c, "ld"); // side label unused for LP
    allocById.set(c.id, {
      id: c.id,
      day_number: c.day_number,
      side: "ld",
      adjusted_pot: input.base_pot,
      carried_to_contest_id: null,
      forfeited: false,
    });
  }

  // Build a lookup by (day_number, contest_type) → contest row for the
  // existing render loop.
  const contestByKey = new Map<string, DailyContestRow>();
  for (const c of contests) {
    contestByKey.set(`${c.day_number}-${c.contest_type}`, c);
  }

  const startDate = new Date(trip.start_date + "T00:00:00");
  const dayLabels = (dayNum: number) => {
    const date = new Date(startDate);
    date.setDate(date.getDate() + dayNum - 1);
    return date.toLocaleDateString("en-US", { weekday: "long" });
  };

  const contestLabels: Record<string, string> = {
    ctp_front: "Closest to Pin — Front 9",
    ctp_back: "Closest to Pin — Back 9",
    long_drive: "Long Drive",
    long_putt: "Long Putt",
  };

  const fmtMoney = (n: number) =>
    n.toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: n % 1 === 0 ? 0 : 2,
    });

  const days = [...new Set(
    (eventDaysResult.data || []).map((d) => d.day_number as number)
  )].sort((a, b) => a - b);
  const lastDay = days[days.length - 1];

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <AutoRefresh />
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-bold text-gray-900">Daily Games</h1>
        <PinnedNoteButton pinnedTo="daily_games" />
      </div>

      {days.map((dayNum) => {
        return (
          <div key={dayNum} className="space-y-2">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              Day {dayNum} &middot; {dayLabels(dayNum)}
            </h2>
            {["ctp_front", "ctp_back", "long_drive", "long_putt"].map((contestType) => {
              const row = contestByKey.get(`${dayNum}-${contestType}`);
              const alloc = row ? allocById.get(row.id) : undefined;
              const cw = (row?.contest_winners ?? [])[0];
              const u = cw?.user
                ? Array.isArray(cw.user) ? cw.user[0] : cw.user
                : null;
              const declaredNoWinner = !!row?.declared_no_winner;
              const hasWinner = !!cw && !declaredNoWinner;
              const isLastDay = dayNum === lastDay;

              const isCtp = contestType.startsWith("ctp");
              const iconColor = isCtp
                ? "bg-teal-50 text-teal-600"
                : contestType === "long_drive"
                ? "bg-sky-50 text-sky-600"
                : "bg-amber-50 text-amber-600";

              // Display pot: adjusted for winners (incl. carry); base for
              // pending tiles (so the preview reflects current pot). For
              // long_putt without a carry chain, fall back to base_pot.
              const displayPot = alloc?.adjusted_pot ?? 0;
              const isPending = !hasWinner && !declaredNoWinner;

              return (
                <div key={contestType} className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                  <div className={`flex items-center justify-center w-10 h-10 rounded-full ${iconColor}`}>
                    {isCtp ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    ) : contestType === "long_drive" ? (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{contestLabels[contestType]}</p>
                    {hasWinner && u ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        {u.avatar_url ? (
                          <img src={u.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[0.5625rem] font-bold">
                            {(u.display_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                        <span className="text-sm text-gray-700 font-medium">{u.display_name}</span>
                      </div>
                    ) : declaredNoWinner ? (
                      <p className="text-xs text-gray-400 mt-0.5">
                        No winner — {isLastDay ? "pot forfeited" : "pot carries forward"}
                      </p>
                    ) : null}
                  </div>
                  {hasWinner && displayPot > 0 ? (
                    <span className="shrink-0 text-sm font-bold tabular-nums text-green-700">
                      {fmtMoney(displayPot)}
                    </span>
                  ) : isPending && displayPot > 0 ? (
                    <div className="shrink-0 flex flex-col items-end gap-1">
                      <span className="text-sm font-semibold tabular-nums text-gray-400">
                        {fmtMoney(displayPot)}
                      </span>
                      <span className="px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700 text-[0.625rem] font-bold tracking-wider">
                        PENDING
                      </span>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        );
      })}

    </div>
  );
}
