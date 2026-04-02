"use client";

import { useState, useEffect, useCallback, useRef } from "react";

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

interface Prize {
  id: string;
  prize_name: string;
  place: number;
  percentage: number;
  per_player: boolean;
  player_count: number;
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

function fake40YardDash(displayName: string): string {
  let hash = 0;
  for (let i = 0; i < displayName.length; i++) {
    hash = ((hash << 5) - hash) + displayName.charCodeAt(i);
    hash |= 0;
  }
  const seconds = 5.0 + (Math.abs(hash) % 30) / 10;
  return seconds.toFixed(1);
}


export function CalcuttaResults({ contestId }: { contestId: string }) {
  const [participants, setParticipants] = useState<ResultParticipant[]>([]);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [loading, setLoading] = useState(true);
  const [resultsView, setResultsView] = useState<"auction" | "summary">("auction");
  const [expandedBuyers, setExpandedBuyers] = useState<Set<string>>(new Set());
  const [resultsSort, setResultsSort] = useState<"order" | "name" | "amount">("order");
  const [summarySort, setSummarySort] = useState<"name" | "count" | "amount">("name");

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/calcutta?contest_id=${contestId}`);
      if (!res.ok) return;
      const data = await res.json();
      setParticipants(data.participants || []);
      setPrizes(data.prizes || []);
      setActiveOrder(data.active_order);
      setSpotlight(data.spotlight || null);
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

  // BSPITW standings for spotlight — full leaderboard, scrollable
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

  // Scroll to center the current participant whenever activeOrder changes
  useEffect(() => {
    // Small delay to ensure DOM has rendered the cubes
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

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      {!auctionStarted && <h1 className="text-2xl font-bold text-gray-900">Calcutta</h1>}

      {participants.length === 0 && (
        <p className="text-gray-500 text-center py-8">Auction not set up yet.</p>
      )}

      {participants.length > 0 && auctionStarted && (
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
      )}

      {/* Spotlight: shown when someone is on the clock */}
      {current && !allSold && (
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
            {/* Scramble days */}
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
                    <p className="text-sm font-medium text-gray-800">
                      {tp.partners.join(", ")}
                    </p>
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
                  <svg className="w-6 h-6 text-green-500" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                    <path d="M7.5 12.5l3 3 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg className="w-6 h-6 text-red-500" viewBox="0 0 24 24" fill="none">
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

            {/* 40-Yard Dash */}
            <div className="bg-white rounded-xl border border-gray-200 p-3 flex items-center justify-between">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">40-Yard Dash</p>
              <p className="text-lg font-bold text-gray-700">
                {current.user ? fake40YardDash(current.user.display_name) + "s" : "—"}
              </p>
            </div>

          </div>

          {/* BSPITW mini-leaderboard — horizontally scrollable */}
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
                        <p className="text-xs font-bold uppercase truncate">
                          {s.display_name.slice(0, 8)}
                        </p>
                        <p className={`text-sm font-bold ${isMe ? "text-white" : "text-blue-700"}`}>
                          {s.points}
                        </p>
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

      {allSold && prizes.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Prize Payouts
          </h2>
          {prizes.map((prize) => {
            const totalPayout = (totalPool * prize.percentage) / 100;
            const perPlayerPayout = prize.per_player ? totalPayout / prize.player_count : null;
            const baseName = prize.prize_name || "Unknown";
            const displayName = prize.place === 1
              ? `${baseName} Champion`
              : prize.place === 2
              ? `${baseName} Runner-Up`
              : `${baseName} ${ordinal(prize.place)} Place`;
            return (
              <div key={prize.id} className="flex items-center gap-3 bg-green-50 rounded-xl px-3 py-2.5">
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{displayName}</p>
                  {prize.per_player && perPlayerPayout != null && (
                    <p className="text-xs text-gray-400">${perPlayerPayout.toFixed(0)} each × {prize.player_count} players</p>
                  )}
                </div>
                <p className="text-lg font-bold text-green-700">${totalPayout.toFixed(0)}</p>
                <p className="text-xs text-gray-400 w-10 text-right">{prize.percentage}%</p>
              </div>
            );
          })}
        </div>
      )}

      {!auctionStarted && prizes.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            Prize Breakdown
          </h2>
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
      )}

      {participants.length > 0 && participants.some((p) => p.sold_at) && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
              {resultsView === "auction" ? "Auction Results" : "Buyer Summary"}
            </h2>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
              <button
                onClick={() => setResultsView("auction")}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  resultsView === "auction" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                }`}
              >
                Results
              </button>
              <button
                onClick={() => setResultsView("summary")}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-colors ${
                  resultsView === "summary" ? "bg-white text-purple-700 shadow-sm" : "text-gray-500"
                }`}
              >
                Summary
              </button>
            </div>
          </div>

          {/* Sort controls */}
          {resultsView === "auction" && (
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
          )}
          {resultsView === "summary" && (
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
          )}

          {resultsView === "auction" && [...participants].sort((a, b) => {
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
                  isActive
                    ? "bg-purple-100 border border-purple-300"
                    : isSold
                    ? "bg-gray-50"
                    : "bg-white border border-gray-100"
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
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {p.user?.display_name || "Unknown"}
                  </p>
                  {isSold && p.ownerships && p.ownerships.length > 1 ? (
                    <p className="text-xs text-gray-400">
                      {p.ownerships.map((o) => `${o.owner?.display_name || "Unknown"} ${o.share_pct}%`).join(" / ")}
                    </p>
                  ) : isSold && p.owner ? (
                    <p className="text-xs text-gray-400">
                      Owned by {p.owner.display_name}
                    </p>
                  ) : null}
                </div>
                {isSold ? (
                  <span className="text-sm font-bold text-green-700">
                    ${Number(p.bid_amount).toFixed(0)}
                  </span>
                ) : isActive ? (
                  <span className="text-xs font-semibold text-purple-700 bg-purple-200 px-2 py-0.5 rounded-full animate-pulse">
                    LIVE
                  </span>
                ) : (
                  <span className="text-xs text-gray-300">—</span>
                )}
              </div>
            );
          })}

          {resultsView === "summary" && (() => {
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
                          <p className="text-xs text-gray-400">
                            {b.count} Loozer{b.count !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <span className="text-sm font-bold text-green-700 flex-shrink-0">
                          ${b.totalSpent.toFixed(0)}
                        </span>
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
                                l.isBuyback
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-purple-100 text-purple-700"
                              }`}
                            >
                              {l.name}
                              {l.sharePct < 100 && (
                                <span className="opacity-60">{l.sharePct}%</span>
                              )}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
