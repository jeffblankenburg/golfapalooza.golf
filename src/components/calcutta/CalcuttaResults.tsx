"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface ResultUser {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  birthday?: string | null;
}

interface ResultOwner {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface OwnershipRecord {
  id: string;
  owner_id: string;
  share_pct: number;
  amount_paid: number;
  is_buyback: boolean;
  owner: ResultOwner | null;
}

interface ResultParticipant {
  id: string;
  auction_order: number;
  bid_amount: number | null;
  sold_at: string | null;
  user_id: string;
  owner_id: string | null;
  user: ResultUser | null;
  owner: ResultOwner | null;
  ownerships?: OwnershipRecord[];
}

interface PrizeWinner {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  is_playoff: boolean;
  notes: string | null;
}

interface Prize {
  id: string;
  prize_name: string;
  place: number;
  percentage: number;
  per_player: boolean;
  player_count: number;
  winners?: PrizeWinner[];
  total_payout?: number;
}

interface TeamPartner {
  contest_name: string;
  partners: string[];
  score: number | null;
  course_par: number | null;
  is_participant?: boolean;
}

interface Accolade {
  title: string;
  trip_name?: string;
}

interface SpotlightData {
  teamPartners: TeamPartner[];
  accolades: Accolade[];
  cornholeSinglesIn: boolean | null;
  eightBagAverage: number | null;
  avgScrambleScore: number | null;
  handicapIndex: number | null;
}

interface LoozerStat {
  handicap: number | null;
  eightBag: number | null;
  avgScramble: number | null;
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function calculateAge(birthday: string): number | null {
  const birth = new Date(birthday + "T00:00:00");
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function calculateAgeDecimal(birthday: string): number | null {
  const birth = new Date(birthday + "T00:00:00");
  if (isNaN(birth.getTime())) return null;
  const ageMs = Date.now() - birth.getTime();
  const years = ageMs / (1000 * 60 * 60 * 24 * 365.25);
  return Math.round(years * 10) / 10;
}

function fakeBspitwStanding(displayName: string): { place: number; points: number } {
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) {
    hash = ((hash << 5) - hash) + displayName.charCodeAt(i);
    hash |= 0;
  }
  const points = (Math.abs(hash) % 15) + 1;
  const place = Math.max(1, 16 - points);
  return { place, points };
}

function Accordion({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center justify-between w-full px-4 py-3 text-left"
      >
        <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">{title}</h2>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
}

export function CalcuttaResults({ contestId, userId, headerAction }: { contestId: string; userId?: string; headerAction?: React.ReactNode }) {
  const [participants, setParticipants] = useState<ResultParticipant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [loozerStats, setLoozerStats] = useState<Record<string, LoozerStat>>({});
  const [loading, setLoading] = useState(true);
  const [resultsView, setResultsView] = useState<"loozers" | "auction" | "summary" | "winners">("loozers");
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());
  const [resultsSort, setResultsSort] = useState<"order" | "name" | "amount">("order");
  const [summarySort, setSummarySort] = useState<"name" | "count" | "amount">("name");
  const [randyAvatar, setRandyAvatar] = useState<string | null>(null);

  const [pool, setPool] = useState(0);
  const [buyerPaid, setBuyerPaid] = useState(true);
  const [buyerOwes, setBuyerOwes] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/calcutta?contest_id=${contestId}`);
      if (!res.ok) return;
      const data = await res.json();
      setParticipants(data.participants || []);
      setPrizes(data.prizes || []);
      setActiveOrder(data.active_order);
      setSpotlight(data.spotlight || null);
      setLoozerStats(data.loozerStats || {});
      if (data.pool != null) setPool(data.pool);
      if (data.buyer_paid != null) setBuyerPaid(data.buyer_paid);
      if (data.buyer_owes != null) setBuyerOwes(data.buyer_owes);
      if (data.randy_avatar_url !== undefined) setRandyAvatar(data.randy_avatar_url);
    } catch {
      // retry next poll
    } finally {
      setLoading(false);
    }
  }, [contestId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalPool = participants.reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);
  const allSold = participants.length > 0 && participants.every((p) => p.sold_at);
  const auctionStarted = participants.some((p) => p.sold_at) || activeOrder != null;
  const soldCount = participants.filter((p) => p.sold_at).length;
  const current = participants.find((p) => p.auction_order === activeOrder);

  // BSPITW standings for spotlight
  const bspitwStandings = current ? (() => {
    const standings = participants
      .filter((p) => p.user)
      .map((p) => ({
        user_id: p.user_id,
        display_name: p.user!.display_name,
        points: fakeBspitwStanding(p.user!.display_name).points,
        place: 0,
      }))
      .sort((a, b) => b.points - a.points || a.display_name.localeCompare(b.display_name));
    standings.forEach((s, i) => { s.place = i + 1; });
    return standings;
  })() : [];

  const bspitwScrollRef = useRef<HTMLDivElement>(null);
  const bspitwActiveRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!bspitwActiveRef.current || !bspitwScrollRef.current) return;
      const container = bspitwScrollRef.current;
      const active = bspitwActiveRef.current;
      container.scrollLeft = active.offsetLeft - container.offsetWidth / 2 + active.offsetWidth / 2;
    }, 50);
    return () => clearTimeout(timer);
  }, [activeOrder]);

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-purple-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ─── Loozers stats table ───
  const loozersGridCols = "1fr 2.5rem 2.5rem 2.5rem 2.5rem";
  const loozersTable = (
    <div className="space-y-1">
      <div className="grid gap-1 px-2 pb-1" style={{ gridTemplateColumns: loozersGridCols }}>
        <span className="text-[10px] font-bold text-gray-400 uppercase">Name</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center">Age</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center">HCP</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center">8 Bag</span>
        <span className="text-[10px] font-bold text-gray-400 uppercase text-center">Avg</span>
      </div>
      {[...participants]
        .sort((a, b) => (a.user?.display_name || "").localeCompare(b.user?.display_name || ""))
        .map((p) => {
          const stats = loozerStats[p.user_id];
          const age = p.user?.birthday ? calculateAgeDecimal(p.user.birthday) : null;
          return (
            <div
              key={p.id}
              className="grid gap-1 items-center px-2 py-1.5 rounded-lg odd:bg-gray-50"
              style={{ gridTemplateColumns: loozersGridCols }}
            >
              <div className="flex items-center gap-2 min-w-0">
                {p.user?.avatar_url ? (
                  <img src={p.user.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-[10px] font-bold flex-shrink-0">
                    {(p.user?.display_name || "?")[0].toUpperCase()}
                  </span>
                )}
                <span className="text-sm font-medium text-gray-900 truncate">
                  {p.user?.display_name || "Unknown"}
                </span>
              </div>
              <span className="text-xs text-gray-700 text-center tabular-nums">{age != null ? age.toFixed(1) : "—"}</span>
              <span className="text-xs text-gray-700 text-center tabular-nums">{stats?.handicap ?? "—"}</span>
              <span className="text-xs text-gray-700 text-center tabular-nums">{stats?.eightBag ?? "—"}</span>
              <span className="text-xs text-gray-700 text-center tabular-nums">{stats?.avgScramble ?? "—"}</span>
            </div>
          );
        })}
    </div>
  );

  // ─── Prize Breakdown ───
  const prizeBreakdown = (
    <div className="space-y-1.5">
      {prizes.map((prize) => {
        const baseName = prize.prize_name || "Unknown";
        const displayName = prize.place === 1
          ? `${baseName} Champion`
          : prize.place === 2
          ? `${baseName} Runner-Up`
          : `${baseName} ${ordinal(prize.place)} Place`;
        return (
          <div key={prize.id} className="flex items-center gap-3 bg-purple-50 rounded-xl px-3 py-2.5">
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              {prize.per_player && (
                <p className="text-xs text-gray-400">Split across {prize.player_count} players</p>
              )}
            </div>
            <p className="text-lg font-bold text-purple-700">{prize.percentage}%</p>
          </div>
        );
      })}
    </div>
  );

  // ─── Auction results list ───
  const auctionResultsList = [...participants].sort((a, b) => {
    if (resultsSort === "name") return (a.user?.display_name || "").localeCompare(b.user?.display_name || "");
    if (resultsSort === "amount") return (Number(b.bid_amount) || 0) - (Number(a.bid_amount) || 0);
    return (a.auction_order || 999) - (b.auction_order || 999);
  }).map((p) => {
    const isActive = p.auction_order === activeOrder;
    const isSold = !!p.sold_at;
    return (
      <div
        key={p.id}
        className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
          isActive ? "bg-purple-100 border border-purple-300" : isSold ? "bg-gray-50" : "bg-white border border-gray-100"
        }`}
      >
        <span className="text-xs font-bold text-gray-400 w-5">{p.auction_order}</span>
        {p.user?.avatar_url ? (
          <img src={p.user.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
        ) : (
          <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold">
            {(p.user?.display_name || "?")[0].toUpperCase()}
          </span>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{p.user?.display_name || "Unknown"}</p>
          {isSold && p.ownerships && p.ownerships.length > 1 ? (
            <p className="text-xs text-gray-400">
              {p.ownerships.map((o) => `${o.owner?.display_name || "Unknown"} ${o.share_pct}%`).join(" / ")}
            </p>
          ) : isSold && p.owner ? (
            <p className="text-xs text-gray-400">Owned by {p.owner.display_name}</p>
          ) : null}
        </div>
        {isSold ? (
          <span className="text-sm font-bold text-green-700">${Number(p.bid_amount).toFixed(0)}</span>
        ) : isActive ? (
          <span className="text-xs font-semibold text-purple-700 bg-purple-200 px-2 py-0.5 rounded-full animate-pulse">LIVE</span>
        ) : (
          <span className="text-xs text-gray-300">—</span>
        )}
      </div>
    );
  });

  // ─── Winners content ───
  const winnersContent = (() => {
    const ownershipByUser: Record<string, OwnershipRecord[]> = {};
    for (const p of participants) {
      if (p.ownerships && p.ownerships.length > 0) {
        ownershipByUser[p.user_id] = p.ownerships;
      } else if (p.owner) {
        ownershipByUser[p.user_id] = [{
          id: "", owner_id: p.owner.id, share_pct: 100,
          amount_paid: Number(p.bid_amount) || 0, is_buyback: false, owner: p.owner,
        }];
      }
    }
    return (
      <div className="space-y-2">
        {prizes.filter((p) => (p.winners?.length || 0) > 0 || p.total_payout).map((prize) => {
          const hasWinners = (prize.winners?.length || 0) > 0;
          const totalPayout = prize.total_payout || (pool * prize.percentage / 100);
          const winnerCount = prize.winners?.length || 1;
          const perPlayerPayout = totalPayout / winnerCount;
          const baseName = prize.prize_name || "Unknown";
          const displayName = prize.place === 1
            ? `${baseName} Champion`
            : prize.place === 2
            ? `${baseName} Runner-Up`
            : `${baseName} ${ordinal(prize.place)} Place`;
          return (
            <div key={prize.id} className={`rounded-xl p-3 ${hasWinners ? "bg-emerald-50 border border-emerald-200" : "bg-gray-50 border border-gray-200"}`}>
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-semibold text-gray-900">
                  {displayName} <span className="text-gray-400 font-normal">({prize.percentage}%)</span>
                </p>
                <p className="text-sm font-bold text-green-700">${totalPayout.toFixed(0)}</p>
              </div>
              {hasWinners ? (
                <div className="space-y-2.5 mt-1">
                  {prize.winners!.map((w) => {
                    const ownerships = ownershipByUser[w.user_id] || [];
                    return (
                      <div key={w.user_id}>
                        {ownerships.map((o) => {
                          const ownerPayout = perPlayerPayout * (o.share_pct / 100);
                          return (
                            <div key={o.owner_id} className="flex items-center gap-2">
                              <span className="text-sm font-bold text-green-700 flex-shrink-0 w-12 text-right">${ownerPayout.toFixed(0)}</span>
                              {o.owner?.avatar_url ? (
                                <img src={o.owner.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                              ) : (
                                <span className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center text-xs font-bold text-purple-700">
                                  {(o.owner?.display_name || "?")[0].toUpperCase()}
                                </span>
                              )}
                              <p className="text-sm text-gray-700 flex-1">
                                <span className="font-semibold text-gray-900">{o.owner?.display_name || "Unknown"}</span>
                                {" owns "}
                                <span className="font-medium">{w.display_name}</span>
                                {o.share_pct < 100 && <span className="text-gray-400"> ({o.share_pct}%)</span>}
                              </p>
                            </div>
                          );
                        })}
                        {ownerships.length === 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-green-700 flex-shrink-0 w-12 text-right">${perPlayerPayout.toFixed(0)}</span>
                            {w.avatar_url ? (
                              <img src={w.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" />
                            ) : (
                              <span className="w-6 h-6 rounded-full bg-emerald-200 flex items-center justify-center text-xs font-bold text-emerald-700">
                                {(w.display_name || "?")[0].toUpperCase()}
                              </span>
                            )}
                            <span className="text-sm text-gray-700 flex-1">{w.display_name}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs text-gray-400 italic">Pending</p>
              )}
            </div>
          );
        })}
        {prizes.every((p) => (p.winners?.length || 0) === 0) && (
          <p className="text-sm text-gray-400 text-center py-4">No winners resolved yet.</p>
        )}
      </div>
    );
  })();

  // ─── Summary content ───
  const summaryContent = (() => {
    interface OwnedLoozer { name: string; amount: number; sharePct: number; isBuyback: boolean }
    const buyerMap = new Map<string, { userId: string; displayName: string; avatarUrl: string | null; count: number; totalSpent: number; loozers: OwnedLoozer[] }>();
    for (const p of participants) {
      if (!p.sold_at) continue;
      const owners = p.ownerships && p.ownerships.length > 0
        ? p.ownerships
        : p.owner_id
        ? [{ owner_id: p.owner_id, amount_paid: Number(p.bid_amount) || 0, share_pct: 100, is_buyback: false, owner: p.owner }]
        : [];
      for (const o of owners) {
        const loozer: OwnedLoozer = {
          name: p.user?.display_name || "Unknown",
          amount: Number(o.amount_paid) || 0,
          sharePct: Number(o.share_pct) || 100,
          isBuyback: !!o.is_buyback,
        };
        const existing = buyerMap.get(o.owner_id);
        if (existing) {
          existing.count++;
          existing.totalSpent += loozer.amount;
          existing.loozers.push(loozer);
        } else {
          buyerMap.set(o.owner_id, {
            userId: o.owner_id,
            displayName: o.owner?.display_name || "Unknown",
            avatarUrl: o.owner?.avatar_url || null,
            count: 1,
            totalSpent: loozer.amount,
            loozers: [loozer],
          });
        }
      }
    }
    const buyers = Array.from(buyerMap.values()).sort((a, b) => {
      if (summarySort === "count") return b.count - a.count || a.displayName.localeCompare(b.displayName);
      if (summarySort === "amount") return b.totalSpent - a.totalSpent || a.displayName.localeCompare(b.displayName);
      return a.displayName.localeCompare(b.displayName);
    });
    return (
      <div className="space-y-1.5">
        {buyers.map((b) => {
          const isExpanded = expandedBuyers.has(b.userId);
          return (
            <div key={b.userId} className="rounded-xl overflow-hidden bg-gray-50">
              <button
                onClick={() => setExpandedBuyers((prev) => {
                  const next = new Set(prev);
                  if (next.has(b.userId)) next.delete(b.userId);
                  else next.add(b.userId);
                  return next;
                })}
                className="flex items-center gap-3 w-full text-left px-3 py-2.5"
              >
                {b.avatarUrl ? (
                  <img src={b.avatarUrl} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <span className="w-8 h-8 rounded-full bg-purple-100 flex items-center justify-center text-purple-700 text-sm font-bold flex-shrink-0">
                    {b.displayName[0].toUpperCase()}
                  </span>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{b.displayName}</p>
                  <p className="text-xs text-gray-400">{b.count} Loozer{b.count !== 1 ? "s" : ""}</p>
                </div>
                <span className="text-sm font-bold text-green-700 flex-shrink-0">${b.totalSpent.toFixed(0)}</span>
                <svg
                  className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {isExpanded && (
                <div className="px-3 pb-2.5 flex flex-wrap gap-1.5">
                  {b.loozers.map((l, i) => (
                    <span
                      key={i}
                      className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full ${
                        l.isBuyback ? "bg-blue-100 text-blue-700" : "bg-purple-100 text-purple-700"
                      }`}
                    >
                      {l.name}
                      {l.sharePct < 100 && <span className="opacity-60">{l.sharePct}%</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  })();

  // ─── Results accordion content (tabs: Loozers | Results | Winners | Summary) ───
  const resultsContent = (
    <div className="space-y-2">
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
        {(["loozers", "auction", "winners", "summary"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setResultsView(t)}
            className={`flex-1 text-xs font-medium px-2 py-1.5 rounded-md transition-colors ${
              resultsView === t ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
            }`}
          >
            {t === "loozers" ? "Loozers" : t === "auction" ? "Results" : t === "winners" ? "Winners" : "Summary"}
          </button>
        ))}
      </div>

      {resultsView === "loozers" && loozersTable}

      {resultsView === "auction" && (
        <>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {([["order", "#"], ["name", "Name"], ["amount", "Bid"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setResultsSort(key)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                  resultsSort === key ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {auctionResultsList}
        </>
      )}

      {resultsView === "winners" && winnersContent}

      {resultsView === "summary" && (
        <>
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            {([["name", "Name"], ["count", "Loozers"], ["amount", "Spent"]] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setSummarySort(key)}
                className={`flex-1 text-xs font-medium py-1.5 rounded-md transition-colors ${
                  summarySort === key ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {summaryContent}
        </>
      )}
    </div>
  );

  // ─── Pool + Sold bar ───
  const poolBar = (
    <div className="flex gap-3">
      <div className="flex-1 bg-purple-50 rounded-xl px-3 py-2.5 text-center">
        <p className="text-xs text-purple-500 font-semibold uppercase">Pool</p>
        <p className="text-lg font-bold text-purple-900">${totalPool.toFixed(0)}</p>
      </div>
      <div className="flex-1 bg-gray-100 rounded-xl px-3 py-2.5 text-center">
        <p className="text-xs text-gray-500 font-semibold uppercase">Sold</p>
        <p className="text-lg font-bold text-gray-900">{soldCount}/{participants.length}</p>
      </div>
    </div>
  );

  // ─── Venmo prompt ───
  const venmoPrompt = !buyerPaid && buyerOwes > 0 ? (() => {
    const venmoDeepLink = `venmo://paycharge?txn=pay&recipients=jwatson1869&amount=${buyerOwes.toFixed(2)}&note=${encodeURIComponent("Calcutta Auction")}`;
    const venmoWebLink = `https://venmo.com/jwatson1869?txn=pay&amount=${buyerOwes.toFixed(2)}&note=${encodeURIComponent("Calcutta Auction")}`;
    return (
      <div className="space-y-2">
        <a
          href={venmoDeepLink}
          onClick={() => { setTimeout(() => { window.open(venmoWebLink, "_blank"); }, 500); }}
          className="relative flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#008CFF] text-white font-bold tracking-wide active:bg-[#0074D4] transition-colors overflow-hidden"
        >
          <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "shimmer 2.5s ease-in-out infinite" }} />
          <img src="/Venmo.png" alt="Venmo" className="w-8 h-8 object-contain relative" />
          <span className="relative">Pay Randy Watson ${buyerOwes.toFixed(2)}</span>
        </a>
        <p className="text-xs text-gray-400 text-center">
          For other payment options, please contact{" "}
          <Link
            href="/loozers/539feb9d-eb8d-4dfe-88d3-7d0bc89c7154"
            className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-medium pl-0.5 pr-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors align-middle"
          >
            {randyAvatar ? (
              <img src={randyAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
            ) : (
              <span className="w-4 h-4 rounded-full bg-green-700 text-white text-[8px] font-bold flex items-center justify-center">R</span>
            )}
            Randy Watson
          </Link>
          {" "}directly.
        </p>
      </div>
    );
  })() : null;

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      {venmoPrompt}

      {participants.length === 0 && (
        <p className="text-gray-500 text-center py-8">Auction not set up yet.</p>
      )}

      {/* ── BEFORE AUCTION ── */}
      {!auctionStarted && participants.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900">Calcutta</h1>
            {headerAction}
            <PinnedNoteButton pinnedTo="calcutta" />
          </div>
          {prizes.length > 0 && (
            <Accordion title="Prize Breakdown" defaultOpen>
              {prizeBreakdown}
            </Accordion>
          )}
          <Accordion title="Loozers" defaultOpen>
            {loozersTable}
          </Accordion>
        </>
      )}

      {/* ── DURING AUCTION ── */}
      {auctionStarted && !allSold && (
        <>
          {poolBar}

          {/* Spotlight: shown when someone is on the clock */}
          {current && (
            <div className="space-y-3">
              {/* Player card */}
              <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
                <div className="flex items-center gap-3 mb-3">
                  <span className="px-2.5 py-1 bg-green-600 rounded-full text-xs font-bold uppercase tracking-wide text-white">
                    On the Clock
                  </span>
                  <span className="text-xs text-gray-400 font-medium">
                    #{current.auction_order} of {participants.length}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {current.user?.avatar_url ? (
                    <img src={current.user.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
                  ) : (
                    <span className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-xl font-bold text-green-700">
                      {(current.user?.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}
                  <div>
                    <p className="text-lg font-bold text-gray-900">{current.user?.display_name || "Unknown"}</p>
                    {current.user?.birthday && (
                      <p className="text-sm text-gray-400">Age {calculateAge(current.user.birthday)}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Metadata grid */}
              <div className="grid grid-cols-2 gap-2">
                {(spotlight?.teamPartners || [])
                  .filter((tp) => !tp.contest_name.toLowerCase().includes("cornhole"))
                  .map((tp, i) => {
                    if (!tp.is_participant) {
                      return (
                        <div key={`scramble-${i}`} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-1">{tp.contest_name}</p>
                            <span className="text-sm font-black text-red-500 uppercase">OUT</span>
                          </div>
                          <svg className="w-8 h-8 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                            <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                          </svg>
                        </div>
                      );
                    }
                    if (tp.partners.length === 0 && tp.score == null) {
                      return (
                        <div key={`scramble-${i}`} className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                          <div>
                            <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">{tp.contest_name}</p>
                            <span className="text-sm font-black text-green-600 uppercase">IN</span>
                          </div>
                          <svg className="w-8 h-8 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                            <path d="M7.5 12.5l3 3 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                        </div>
                      );
                    }
                    return (
                      <div key={`scramble-${i}`} className="bg-white rounded-xl border border-gray-200 p-3">
                        <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">{tp.contest_name}</p>
                        <p className="text-sm font-medium text-gray-800">{tp.partners.join(", ")}</p>
                        {tp.score != null && (
                          <div className="flex justify-center mt-2">
                            <span className={`w-12 h-12 rounded-full bg-green-100 flex items-center justify-center text-lg font-bold ${
                              tp.course_par != null
                                ? tp.score - tp.course_par < 0 ? "text-green-700" : tp.score - tp.course_par > 0 ? "text-red-600" : "text-gray-700"
                                : "text-green-700"
                            }`}>
                              {tp.course_par != null
                                ? (tp.score - tp.course_par <= 0 ? "" : "+") + (tp.score - tp.course_par)
                                : tp.score}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}

                {/* Cornhole Singles */}
                <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">Cornhole Singles</p>
                    {spotlight?.cornholeSinglesIn == null ? (
                      <span className="text-sm font-medium text-gray-400">—</span>
                    ) : spotlight.cornholeSinglesIn ? (
                      <span className="text-sm font-bold text-green-600">IN</span>
                    ) : (
                      <span className="text-sm font-bold text-red-500">OUT</span>
                    )}
                  </div>
                  {spotlight?.cornholeSinglesIn != null && (
                    spotlight.cornholeSinglesIn ? (
                      <svg className="w-8 h-8 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                        <path d="M7.5 12.5l3 3 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg className="w-8 h-8 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                        <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                        <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                      </svg>
                    )
                  )}
                </div>

                {/* Cornhole Doubles */}
                {(spotlight?.teamPartners || [])
                  .filter((tp) => tp.contest_name.toLowerCase().includes("cornhole"))
                  .map((tp, i) => (
                  <div key={`corn-${i}`} className="bg-white rounded-xl border border-gray-200 p-3">
                    <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">{tp.contest_name}</p>
                    <p className="text-sm font-medium text-gray-800">
                      {tp.partners.length > 0 ? tp.partners.join(", ") : "—"}
                    </p>
                  </div>
                ))}

                {/* Handicap */}
                <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Handicap</p>
                  <p className="text-lg font-bold text-gray-700">
                    {spotlight?.handicapIndex != null ? spotlight.handicapIndex : "—"}
                  </p>
                </div>

                {/* 8 Bag Average */}
                <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">8 Bag Average</p>
                  <p className="text-lg font-bold text-gray-700">
                    {spotlight?.eightBagAverage != null ? spotlight.eightBagAverage : "—"}
                  </p>
                </div>

                {/* Avg Scramble */}
                <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">Avg Scramble</p>
                  <p className="text-lg font-bold text-gray-700">
                    {spotlight?.avgScrambleScore != null ? spotlight.avgScrambleScore : "—"}
                  </p>
                </div>
              </div>

              {/* BSPITW mini-leaderboard */}
              {bspitwStandings.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wide mb-2 px-1">BSPITW</p>
                  <div ref={bspitwScrollRef} className="overflow-x-auto -mx-1" style={{ scrollbarWidth: "none" }}>
                    <div className="flex gap-1.5 px-1">
                      {bspitwStandings.map((s) => {
                        const isMe = s.user_id === current.user_id;
                        return (
                          <div
                            key={s.user_id}
                            ref={isMe ? bspitwActiveRef : undefined}
                            className={`w-24 flex-shrink-0 rounded-lg p-2 text-center ${
                              isMe ? "bg-blue-600 text-white" : "bg-white border border-gray-200"
                            }`}
                          >
                            <p className={`text-[10px] font-bold uppercase ${isMe ? "text-blue-200" : "text-gray-400"}`}>
                              {ordinal(s.place)}
                            </p>
                            <p className="text-xs font-bold uppercase truncate">{s.display_name.slice(0, 8)}</p>
                            <p className={`text-sm font-bold ${isMe ? "text-white" : "text-blue-700"}`}>{s.points}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Accolades */}
              {spotlight?.accolades && spotlight.accolades.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-3">
                  <p className="text-xs font-bold text-yellow-600 uppercase tracking-wide mb-2">Past Wins</p>
                  <div className="space-y-1">
                    {spotlight.accolades.map((acc, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-yellow-500 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                        <span className="text-sm font-medium text-gray-800">{acc.title}</span>
                        {acc.trip_name && (
                          <span className="text-xs text-gray-400">({acc.trip_name})</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Accordions below spotlight */}
          {participants.some((p) => p.sold_at) && (
            <Accordion title="Results" defaultOpen>
              {resultsContent}
            </Accordion>
          )}
          {prizes.length > 0 && (
            <Accordion title="Prize Breakdown">
              {prizeBreakdown}
            </Accordion>
          )}
        </>
      )}

      {/* ── AFTER AUCTION ── */}
      {allSold && (
        <>
          {poolBar}
          <Accordion title="Results" defaultOpen>
            {resultsContent}
          </Accordion>
          {prizes.length > 0 && (
            <Accordion title="Prize Breakdown">
              {prizeBreakdown}
            </Accordion>
          )}
        </>
      )}
    </div>
  );
}
