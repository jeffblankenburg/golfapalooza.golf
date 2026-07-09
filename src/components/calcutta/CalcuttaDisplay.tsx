"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { AwardBadge } from "@/components/AwardBadge";

interface DisplayUser {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  birthday?: string | null;
}

interface DisplayOwner {
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
  owner: DisplayOwner | null;
}

interface DisplayParticipant {
  id: string;
  user_id: string;
  auction_order: number;
  bid_amount: number | null;
  sold_at: string | null;
  owner_id: string | null;
  user: DisplayUser | null;
  owner: DisplayOwner | null;
  ownerships?: OwnershipRecord[];
}

interface DisplayPrize {
  id: string;
  prize_name: string;
  place: number;
  percentage: number;
  sort_order: number;
  per_player: boolean;
  player_count: number;
}

interface TeamPartner {
  contest_name: string;
  partners: string[];
  partnerAvatars: (string | null)[];
  score: number | null;
  course_par: number | null;
  is_participant?: boolean;
}

interface AccoladePartner {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface GroupedAccolade {
  category: string;
  title: string;
  short_label: string;
  icon: string;
  icon_url: string | null;
  sort_order: number;
  count: number;
  trip_name: string | null;
  trip_year: number | null;
  partners: AccoladePartner[];
}

interface SpotlightData {
  teamPartners: TeamPartner[];
  accolades: GroupedAccolade[];
  cornholeSinglesIn: boolean | null;
  eightBagAverage: number | null;
  avgScrambleScore: number | null;
  handicapIndex: number | null;
}

// Accolade categories worth surfacing on the auction display — the trophies
// for the contests this event actually runs.
const HEADER_ACCOLADE_CATEGORIES = new Set([
  "green_jacket",
  "cornhole_singles",
  "cornhole_doubles",
  "bspitw",
]);

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

// Fake BSPITW standings — replace with real data when available
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

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

// The header name shows in full (no truncation) but shrinks as it gets longer
// so the identity block keeps a constant footprint next to the trophy shelf.
function headerNameSizeClass(name: string): string {
  const len = name.length;
  if (len <= 7) return "text-7xl";
  if (len <= 9) return "text-6xl";
  if (len <= 12) return "text-5xl";
  if (len <= 16) return "text-4xl";
  if (len <= 20) return "text-3xl";
  return "text-2xl";
}

export function CalcuttaDisplay({ contestId }: { contestId: string }) {
  const [participants, setParticipants] = useState<DisplayParticipant[]>([]);
  const [prizes, setPrizes] = useState<DisplayPrize[]>([]);
  const [activeOrder, setActiveOrder] = useState<number | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightData | null>(null);
  const [loozerAccolades, setLoozerAccolades] = useState<Record<string, GroupedAccolade[]>>({});
  const [contestName, setContestName] = useState("");
  const activeRef = useRef<HTMLDivElement>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/calcutta?contest_id=${contestId}`);
      if (!res.ok) return;
      const data = await res.json();
      setParticipants(data.participants || []);
      setPrizes(data.prizes || []);
      setContestName(data.contest_name || "");
      setSpotlight(data.spotlight || null);
      setLoozerAccolades(data.loozerAccolades || {});
      setActiveOrder(data.active_order);
    } catch {
      // Silently retry on next poll
    }
  }, [contestId]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const totalPool = participants.reduce((sum, p) => sum + (Number(p.bid_amount) || 0), 0);
  const allSold = participants.length > 0 && participants.every((p) => p.sold_at);
  const auctionStarted = participants.some((p) => p.sold_at) || activeOrder != null;
  const current = participants.find((p) => p.auction_order === activeOrder);
  // The header trophy shelf only surfaces the accolades tied to what's being
  // competed for at this event: Green Jacket, Cornhole (singles + doubles),
  // and BSPITW. Other honors (MVL, ROY, MELC, custom, …) are omitted here.
  const currentAccolades = current
    ? (loozerAccolades[current.user_id] || []).filter((a) => HEADER_ACCOLADE_CATEGORIES.has(a.category))
    : [];
  const soldCount = participants.filter((p) => p.sold_at).length;

  // Auto-scroll sidebar to keep active participant visible
  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activeOrder]);

  // Determine which main content to show
  const showPreAuction = !auctionStarted && !allSold;
  const showSpotlight = !!current && !allSold;
  const showComplete = allSold;
  const showPaused = auctionStarted && !current && !allSold;

  return (
    <div className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden">
      <div className="h-full max-w-full aspect-video bg-gray-100 text-gray-900 flex overflow-hidden">

        {/* LEFT SIDEBAR — always identical */}
        <div className="w-96 bg-white border-r border-gray-200 flex flex-col">
          <div className="px-5 py-4 border-b border-gray-200 bg-green-700">
            <h2 className="text-lg font-black text-white tracking-widest uppercase">
              Calcutta Participants
            </h2>
          </div>

          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "none" }}>
            {participants.map((p) => {
              const isActive = p.auction_order === activeOrder;
              const isSold = !!p.sold_at;

              return (
                <div
                  key={p.id}
                  ref={isActive ? activeRef : undefined}
                  className={`flex items-center gap-3 px-5 py-3 border-b transition-all duration-500 ${
                    isActive
                      ? "bg-green-100 border-l-4 border-l-green-600 border-b-green-200"
                      : isSold
                      ? "bg-gray-50 border-l-4 border-l-green-500 border-b-gray-200 opacity-60"
                      : "border-l-4 border-l-transparent border-b-gray-100"
                  }`}
                >
                  <span className={`text-sm font-black w-7 text-center flex-shrink-0 ${
                    isActive ? "text-green-700" : isSold ? "text-green-600" : "text-gray-400"
                  }`}>
                    {p.auction_order}
                  </span>

                  <p className={`text-lg font-bold uppercase tracking-wide truncate flex-1 min-w-0 ${
                    isActive ? "text-green-900" : isSold ? "text-gray-500" : "text-gray-800"
                  }`}>
                    {(p.user?.display_name || "Unknown").slice(0, 10)}
                  </p>

                  {isSold && (
                    <>
                      <span className="text-lg font-bold text-gray-400 truncate flex-shrink-0">
                        {p.ownerships && p.ownerships.length > 1
                          ? p.ownerships.map((o) => o.owner?.display_name?.slice(0, 8)).join(" / ")
                          : p.owner?.display_name?.slice(0, 10)}
                      </span>
                      <span className="text-lg font-bold text-green-600 flex-shrink-0">
                        ${Number(p.bid_amount).toFixed(0)}
                      </span>
                    </>
                  )}

                  {isActive && (
                    <span className="flex-shrink-0 w-3 h-3 rounded-full bg-green-500 animate-pulse" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="px-5 py-3 bg-green-700">
            <p className="text-lg font-black text-white text-center tracking-wide">
              ${totalPool.toFixed(0)}
            </p>
          </div>
        </div>

        {/* MAIN AREA — always the same wrapper, only children swap */}
        <div className="flex-1 flex flex-col items-center p-8 min-w-0 overflow-hidden">

          {showPreAuction && (
              <>
                <h1 className="text-7xl font-black text-gray-900 mb-1 tracking-tight">
                  CALCUTTA AUCTION
                </h1>
                <p className="text-2xl text-gray-500 font-medium mb-6">
                  {participants.length} Loozers up for auction
                </p>

                {prizes.length > 0 && (
                  <div className="w-full max-w-full px-4">
                    <h2 className="text-base font-black text-gray-400 uppercase tracking-widest mb-3 text-center">
                      Prize Breakdown
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      {prizes.map((prize) => (
                        <div
                          key={prize.id}
                          className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex flex-col items-center text-center"
                        >
                          <p className="text-4xl font-black text-green-700 mb-1">
                            {prize.per_player ? `${(prize.percentage / prize.player_count).toFixed(prize.percentage % prize.player_count === 0 ? 0 : 1)}%` : `${prize.percentage}%`}
                          </p>
                          {prize.per_player && (
                            <p className="text-sm text-gray-400 font-semibold">per player x{prize.player_count}</p>
                          )}
                          <p className="text-lg font-bold text-gray-900 leading-tight">
                            {prize.place === 1
                              ? `${prize.prize_name} Champion`
                              : prize.place === 2
                              ? `${prize.prize_name} Runner-Up`
                              : `${prize.prize_name} ${ordinal(prize.place)} Place`}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {showSpotlight && current && (
              <div className="flex flex-col items-center w-full">
                {/* HEADER — logo-less, spread wide, sized to read from across
                    the room. Identity on the left, accolade "trophy shelf" on
                    the right when the Loozer has any. */}
                <div className="w-full mb-8">
                  <div className="flex items-center justify-center gap-5 mb-6">
                    <span className="inline-block px-12 py-3 bg-green-600 rounded-full text-3xl font-black uppercase tracking-[0.3em] text-white shadow-lg">
                      Now on the Clock
                    </span>
                    <span className="text-3xl font-black text-gray-400 uppercase tracking-wide">
                      #{current.auction_order} of {participants.length}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-12">
                    {/* Identity */}
                    <div className="flex items-center gap-8 flex-shrink-0">
                      {current.user?.avatar_url ? (
                        <img
                          src={current.user.avatar_url}
                          alt=""
                          className="w-52 h-52 rounded-full object-cover ring-4 ring-green-500 shadow-xl"
                        />
                      ) : (
                        <span className="w-52 h-52 rounded-full bg-green-100 flex items-center justify-center text-8xl font-black text-green-700 ring-4 ring-green-500 shadow-xl">
                          {(current.user?.display_name || "?")[0].toUpperCase()}
                        </span>
                      )}
                      <div className="text-left">
                        <h1 className={`${headerNameSizeClass(current.user?.display_name || "Unknown")} font-black text-gray-900 tracking-tighter uppercase leading-none whitespace-nowrap`}>
                          {current.user?.display_name || "Unknown"}
                        </h1>
                        {current.user?.birthday && (
                          <p className="text-4xl text-gray-400 font-bold uppercase tracking-wide mt-3">
                            Age {calculateAge(current.user.birthday)}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Trophy shelf — a 2-row grid so every badge sits on a
                        common baseline (row 1) and every label starts on a
                        common line (row 2), regardless of label line count. */}
                    {currentAccolades.length > 0 && (
                      <div className="grid grid-rows-2 grid-flow-col auto-cols-[7.5rem] gap-x-6 gap-y-3 pl-6 border-l-2 border-gray-200">
                        {currentAccolades.slice(0, 6).map((acc, i) => (
                          <Fragment key={i}>
                            <div className="relative flex items-end justify-center" title={acc.title}>
                              <AwardBadge iconUrl={acc.icon_url} emoji={acc.icon} alt={acc.title} size="xl" />
                              {acc.count > 1 && (
                                <span className="absolute -top-2 right-2 min-w-[2.5rem] h-10 px-2 flex items-center justify-center rounded-full bg-yellow-500 text-white text-2xl font-black shadow-md">
                                  ×{acc.count}
                                </span>
                              )}
                            </div>
                            <span className="text-base font-black uppercase tracking-wide text-gray-500 text-center leading-tight">
                              {acc.title}
                            </span>
                          </Fragment>
                        ))}
                        {currentAccolades.length > 6 && (
                          <span className="flex items-end justify-center text-4xl font-black text-gray-400">
                            +{currentAccolades.length - 6}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Metadata grid */}
                <div className="grid grid-cols-2 gap-4 w-full">
                  {/* Scramble days */}
                  {(spotlight?.teamPartners || [])
                    .filter((tp) => !tp.contest_name.toLowerCase().includes("cornhole"))
                    .map((tp, i) => {
                      // Not a participant — show OUT
                      if (!tp.is_participant) {
                        return (
                          <div key={`scramble-${i}`} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-bold text-red-600 uppercase tracking-wide mb-2">
                                {tp.contest_name}
                              </h3>
                              <span className="text-lg font-black text-red-500 uppercase tracking-wide">OUT</span>
                            </div>
                            <svg className="w-12 h-12 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                              <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                            </svg>
                          </div>
                        );
                      }

                      // Participant — show partners if assigned, or IN if no team yet
                      if (tp.partners.length === 0 && tp.score == null) {
                        return (
                          <div key={`scramble-${i}`} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between">
                            <div>
                              <h3 className="text-lg font-bold text-green-700 uppercase tracking-wide mb-2">
                                {tp.contest_name}
                              </h3>
                              <span className="text-lg font-black text-green-600 uppercase tracking-wide">IN</span>
                            </div>
                            <svg className="w-12 h-12 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                              <path d="M7.5 12.5l3 3 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </div>
                        );
                      }

                      return (
                        <div key={`scramble-${i}`} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <h3 className="text-lg font-bold text-green-700 uppercase tracking-wide mb-2">
                              {tp.contest_name}
                            </h3>
                            <p className="text-lg text-gray-800 font-bold uppercase tracking-wide truncate">
                              {tp.partners.join(", ")}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0">
                            {tp.partners.length > 0 && (
                              <div className="flex items-center gap-2">
                                {tp.partners.map((name, idx) => {
                                  const av = tp.partnerAvatars[idx] ?? null;
                                  return av ? (
                                    <img
                                      key={idx}
                                      src={av}
                                      alt=""
                                      className="w-14 h-14 rounded-full object-cover ring-2 ring-green-500"
                                    />
                                  ) : (
                                    <span
                                      key={idx}
                                      className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center text-xl font-black text-green-700 ring-2 ring-green-500"
                                    >
                                      {name[0]?.toUpperCase()}
                                    </span>
                                  );
                                })}
                              </div>
                            )}
                            {tp.score != null && (
                              <span className={`text-4xl font-black ${
                                tp.course_par != null
                                  ? tp.score - tp.course_par < 0 ? "text-green-700" : tp.score - tp.course_par > 0 ? "text-red-600" : "text-gray-700"
                                  : "text-gray-700"
                              }`}>
                                {tp.course_par != null
                                  ? (tp.score - tp.course_par <= 0 ? "" : "+") + (tp.score - tp.course_par)
                                  : tp.score}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}

                  {/* Cornhole Singles status */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between">
                    <div>
                      <h3 className={`text-lg font-bold uppercase tracking-wide mb-2 ${
                        spotlight?.cornholeSinglesIn == null ? "text-gray-500" :
                        spotlight.cornholeSinglesIn ? "text-green-700" : "text-red-600"
                      }`}>
                        Cornhole Singles
                      </h3>
                      {spotlight?.cornholeSinglesIn == null ? (
                        <span className="text-lg font-bold text-gray-400 uppercase tracking-wide">—</span>
                      ) : spotlight.cornholeSinglesIn ? (
                        <span className="text-lg font-black text-green-600 uppercase tracking-wide">IN</span>
                      ) : (
                        <span className="text-lg font-black text-red-500 uppercase tracking-wide">OUT</span>
                      )}
                    </div>
                    {spotlight?.cornholeSinglesIn != null && (
                      spotlight.cornholeSinglesIn ? (
                        <svg className="w-12 h-12 text-green-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                          <path d="M7.5 12.5l3 3 6-6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg className="w-12 h-12 text-red-500 flex-shrink-0" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="currentColor" fillOpacity="0.1" />
                          <line x1="4.5" y1="4.5" x2="19.5" y2="19.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                        </svg>
                      )
                    )}
                  </div>

                  {/* Cornhole Doubles partners */}
                  {(spotlight?.teamPartners || []).filter((tp) => tp.contest_name.toLowerCase().includes("cornhole")).map((tp, i) => {
                    const partnerAvatar = tp.partnerAvatars[0] ?? null;
                    return (
                      <div key={`cornhole-${i}`} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <h3 className="text-lg font-bold text-green-700 uppercase tracking-wide mb-2">
                            {tp.contest_name}
                          </h3>
                          <p className="text-lg text-gray-800 font-bold uppercase tracking-wide truncate">
                            {tp.partners.length > 0 ? tp.partners.join(", ") : "—"}
                          </p>
                        </div>
                        {tp.partners.length > 0 && (
                          partnerAvatar ? (
                            <img
                              src={partnerAvatar}
                              alt=""
                              className="w-16 h-16 rounded-full object-cover flex-shrink-0 ring-2 ring-green-500"
                            />
                          ) : (
                            <span className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center text-2xl font-black text-green-700 flex-shrink-0 ring-2 ring-green-500">
                              {tp.partners[0][0]?.toUpperCase()}
                            </span>
                          )
                        )}
                      </div>
                    );
                  })}

                  {/* Handicap */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-500 uppercase tracking-wide">
                      Handicap
                    </h3>
                    <span className="text-4xl font-black text-gray-700 flex-shrink-0 ml-4">
                      {spotlight?.handicapIndex != null ? spotlight.handicapIndex : "—"}
                    </span>
                  </div>

                  {/* 8 Bag Average */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-500 uppercase tracking-wide">
                      8 Bag Average
                    </h3>
                    <span className="text-4xl font-black text-gray-700 flex-shrink-0 ml-4">
                      {spotlight?.eightBagAverage != null ? spotlight.eightBagAverage : "—"}
                    </span>
                  </div>

                  {/* Average Scramble Score */}
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-200 flex items-center justify-between">
                    <h3 className="text-lg font-bold text-gray-500 uppercase tracking-wide">
                      Avg Scramble
                    </h3>
                    <span className="text-4xl font-black text-gray-700 flex-shrink-0 ml-4">
                      {spotlight?.avgScrambleScore != null ? spotlight.avgScrambleScore : "—"}
                    </span>
                  </div>


                  {/* BSPITW standings — 7-cube contextual leaderboard */}
                  {(() => {
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

                    const currentIdx = standings.findIndex((s) => s.user_id === current.user_id);
                    const windowSize = Math.min(7, standings.length);
                    let start = Math.max(0, currentIdx - 3);
                    if (start + windowSize > standings.length) {
                      start = Math.max(0, standings.length - windowSize);
                    }
                    const windowSlice = standings.slice(start, start + windowSize);

                    return (
                      <div className="col-span-2 space-y-2">
                      <h3 className="text-lg font-bold text-blue-600 uppercase tracking-wide px-5">BSPITW</h3>
                      <div className="flex gap-2">
                        {windowSlice.map((s) => {
                          const isMe = s.user_id === current.user_id;
                          return (
                            <div
                              key={s.user_id}
                              className={`flex-1 rounded-xl p-3 text-center ${
                                isMe ? "bg-blue-600 text-white ring-2 ring-blue-400" : "bg-white text-gray-800"
                              }`}
                            >
                              <p className={`text-xs font-bold uppercase tracking-wide ${
                                isMe ? "text-blue-200" : "text-gray-400"
                              }`}>
                                {ordinal(s.place)}
                              </p>
                              <p className="text-sm font-black uppercase truncate">
                                {s.display_name.slice(0, 8)}
                              </p>
                              <p className={`text-lg font-black ${
                                isMe ? "text-white" : "text-blue-700"
                              }`}>
                                {s.points} pts
                              </p>
                            </div>
                          );
                        })}
                      </div>
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {showComplete && (
              <>
                <h1 className="text-7xl font-black text-gray-900 mb-2 tracking-tight">
                  AUCTION COMPLETE
                </h1>
                <p className="text-8xl font-black text-green-600 mb-2">
                  ${totalPool.toFixed(0)}
                </p>
                <p className="text-2xl text-gray-500 font-medium mb-6">
                  Total Pool from {participants.length} Loozers
                </p>

                {prizes.length > 0 && (
                  <div className="w-full max-w-full px-4">
                    <h2 className="text-base font-black text-gray-400 uppercase tracking-widest mb-3 text-center">
                      Prize Payouts
                    </h2>
                    <div className="grid grid-cols-3 gap-3">
                      {prizes.map((prize) => {
                        const totalPayout = (totalPool * prize.percentage) / 100;
                        const perPlayerPayout = prize.per_player ? totalPayout / prize.player_count : null;
                        return (
                          <div
                            key={prize.id}
                            className="bg-white rounded-xl p-4 shadow-sm border border-gray-200 flex flex-col items-center text-center"
                          >
                            <p className="text-4xl font-black text-green-600 mb-1">
                              ${totalPayout.toFixed(0)}
                            </p>
                            <p className="text-lg font-bold text-gray-900 leading-tight">
                              {prize.place === 1
                                ? `${prize.prize_name} Champion`
                                : prize.place === 2
                                ? `${prize.prize_name} Runner-Up`
                                : `${prize.prize_name} ${ordinal(prize.place)} Place`}
                            </p>
                            {prize.per_player && perPlayerPayout != null && (
                              <p className="text-sm text-gray-400 mt-0.5">${perPlayerPayout.toFixed(0)} each x{prize.player_count}</p>
                            )}
                            <p className="text-sm text-gray-300 font-bold">{prize.percentage}%</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>
            )}

            {showPaused && (
              <>
                <h1 className="text-5xl font-black text-gray-400 mb-4">
                  Auction Paused
                </h1>
                <p className="text-2xl text-gray-500 font-medium">
                  {soldCount} of {participants.length} sold &middot; Pool: ${totalPool.toFixed(0)}
                </p>
              </>
            )}

        </div>
      </div>
    </div>
  );
}
