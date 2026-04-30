"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";
import { PickemHeader } from "@/components/pickem/PickemHeader";
import { logActivity } from "@/components/ActivityTracker";

interface Game {
  id: string;
  away_team: string;
  home_team: string;
  away_logo_url: string | null;
  home_logo_url: string | null;
  away_color: string | null;
  home_color: string | null;
  spread: number;
  favorite: "away" | "home";
  game_time: string;
  tv_channel: string | null;
  is_tiebreaker: boolean;
  winning_team: "away" | "home" | null;
  away_score: number | null;
  home_score: number | null;
  is_locked: boolean;
}

interface Pick {
  game_id: string;
  user_id: string;
  picked_team: string;
  tiebreaker_total: number | null;
}

interface LeaderboardEntry {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  picks_count: number;
  correct: number;
  decided: number;
  tiebreaker_total: number | null;
  tiebreaker_diff: number | null;
  rank: number;
  picks?: Array<{ game_id: string; picked_team: string }>;
}

export function PickemContent({
  contestId,
  headerAction,
}: {
  contestId: string;
  headerAction?: React.ReactNode;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [myPicks, setMyPicks] = useState<Pick[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [effectiveUserId, setEffectiveUserId] = useState<string | null>(null);
  const [entryFee, setEntryFee] = useState<number>(0);
  const [payoutPcts, setPayoutPcts] = useState<Array<{ place: number; percentage: number }>>([]);
  const [hasPaid, setHasPaid] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [tab, setTab] = useState<"picks" | "leaderboard">("picks");
  const [savedIndicator, setSavedIndicator] = useState<string | null>(null);
  const [whiteyAvatar, setWhiteyAvatar] = useState<string | null>(null);
  const savedTimerRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/pickem?contest_id=${contestId}`);
    const data = await res.json();
    setGames(data.games || []);
    setMyPicks(data.my_picks || []);
    setLeaderboard(data.leaderboard || []);
    setEffectiveUserId(data.effective_user_id || null);
    setEntryFee(data.settings?.entry_fee || 0);
    setPayoutPcts(data.settings?.payout_json || []);
    setHasPaid(data.has_paid || false);
  }, [contestId]);

  useEffect(() => {
    fetchData().then(() => setLoading(false));
    fetch("/api/loozers/c09e0b49-57bb-47ec-a767-294830509942")
      .then((r) => r.json())
      .then((d) => setWhiteyAvatar(d.profile?.avatar_url || null))
      .catch(() => {});
  }, [fetchData]);

  const submitPick = async (gameId: string, pickedTeam: "away" | "home", tiebreakerTotal?: number) => {
    setSaving(gameId);

    // Optimistic update
    setMyPicks((prev) => {
      const existing = prev.find((p) => p.game_id === gameId);
      if (existing) {
        return prev.map((p) =>
          p.game_id === gameId
            ? { ...p, picked_team: pickedTeam, tiebreaker_total: tiebreakerTotal ?? p.tiebreaker_total }
            : p
        );
      }
      return [
        ...prev,
        {
          game_id: gameId,
          user_id: effectiveUserId || "",
          picked_team: pickedTeam,
          tiebreaker_total: tiebreakerTotal ?? null,
        },
      ];
    });

    const res = await fetch("/api/pickem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        picked_team: pickedTeam,
        tiebreaker_total: tiebreakerTotal,
      }),
    });

    if (res.ok) {
      logActivity("pickem_pick", "/pickem", { game_id: gameId, picked_team: pickedTeam });
      // Show saved indicator briefly
      setSavedIndicator(gameId);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedIndicator(null), 1500);
    } else {
      // Revert on failure
      await fetchData();
    }
    setSaving(null);
  };

  const submitTiebreaker = async (gameId: string, total: number) => {
    const existingPick = myPicks.find((p) => p.game_id === gameId);
    if (!existingPick) return;

    setSaving(gameId);
    await fetch("/api/pickem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        game_id: gameId,
        picked_team: existingPick.picked_team,
        tiebreaker_total: total,
      }),
    });
    await fetchData();
    setSaving(null);
  };

  const getMyPick = (gameId: string) => myPicks.find((p) => p.game_id === gameId);

  const isPickCorrect = (pick: Pick, game: Game): boolean | null => {
    if (!game.winning_team || game.away_score === null || game.home_score === null) return null;
    const margin = game.home_score - game.away_score;
    const homeSpread = game.favorite === "home" ? game.spread : -game.spread;
    const homeCovers = margin + homeSpread > 0;
    return pick.picked_team === "home" ? homeCovers : !homeCovers;
  };

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-8 h-8 border-4 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const pickedCount = myPicks.length;
  const totalGames = games.length;
  const correctCount = myPicks.reduce((acc, pick) => {
    const game = games.find((g) => g.id === pick.game_id);
    if (!game) return acc;
    const result = isPickCorrect(pick, game);
    return result === true ? acc + 1 : acc;
  }, 0);
  const decidedCount = games.filter((g) => g.winning_team).length;

  return (
    <div className="px-4 pt-6 pb-24">
      <div className="flex items-center justify-between mb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 active:bg-gray-200 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Home
        </Link>
        <div className="flex items-center gap-2">
          {headerAction}
          <PinnedNoteButton pinnedTo="pickem" />
        </div>
      </div>

      <div className="text-center mb-4">
        <PickemHeader size={120} />
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 mt-2 mb-4">
        <span className="text-sm text-gray-500">
          {pickedCount}/{totalGames} picked
        </span>
        {decidedCount > 0 && (
          <span className="text-sm font-medium text-green-700">
            {correctCount}/{decidedCount} correct
          </span>
        )}
        {hasPaid && (
          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Paid</span>
        )}
      </div>

      {/* Venmo payment prompt */}
      {!hasPaid && pickedCount > 0 && entryFee > 0 && (() => {
        const venmoDeepLink = `venmo://paycharge?txn=pay&recipients=aaronlwhite&amount=${entryFee}&note=${encodeURIComponent("Whitey's Pick'em")}`;
        const venmoWebLink = `https://venmo.com/aaronlwhite?txn=pay&amount=${entryFee}&note=${encodeURIComponent("Whitey's Pick'em")}`;
        return (
          <div className="space-y-2 mb-4">
            <a
              href={venmoDeepLink}
              onClick={() => {
                setTimeout(() => { window.open(venmoWebLink, "_blank"); }, 500);
              }}
              className="relative flex items-center justify-center gap-2 w-full py-3 rounded-2xl bg-[#008CFF] text-white font-bold tracking-wide active:bg-[#0074D4] transition-colors overflow-hidden"
            >
              <div className="absolute top-0 bottom-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: "shimmer 2.5s ease-in-out infinite" }} />
              <img src="/Venmo.png" alt="Venmo" className="w-8 h-8 object-contain relative" />
              <span className="relative">Pay Whitey ${entryFee}</span>
            </a>
            <p className="text-xs text-gray-400 text-center">
              For other payment options, please contact{" "}
              <Link
                href="/loozers/c09e0b49-57bb-47ec-a767-294830509942"
                className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 font-medium pl-0.5 pr-2 py-0.5 rounded-full hover:bg-gray-200 transition-colors align-middle"
              >
                {whiteyAvatar ? (
                  <img src={whiteyAvatar} alt="" className="w-4 h-4 rounded-full object-cover" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-green-700 text-white text-[8px] font-bold flex items-center justify-center">W</span>
                )}
                Whitey
              </Link>
              {" "}directly.
            </p>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="flex rounded-xl bg-gray-100 p-1 mb-4">
        <button
          onClick={() => setTab("picks")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "picks" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          My Picks
        </button>
        <button
          onClick={() => setTab("leaderboard")}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            tab === "leaderboard" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500"
          }`}
        >
          Leaderboard
        </button>
      </div>

      {tab === "picks" ? (
        <div className="space-y-3">
          {games.map((game) => {
            const pick = getMyPick(game.id);
            const result = pick ? isPickCorrect(pick, game) : null;
            const isSaving = saving === game.id;
            const justSaved = savedIndicator === game.id;

            return (
              <div
                key={game.id}
                className={`rounded-2xl border overflow-hidden transition-all ${
                  game.is_locked
                    ? "border-gray-200 bg-gray-50"
                    : "border-gray-200 bg-white shadow-sm"
                }`}
              >
                {/* Game header */}
                <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{formatTime(game.game_time)}</span>
                    {game.tv_channel && (
                      <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                        {game.tv_channel}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {game.is_locked && (
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    )}
                    {justSaved && (
                      <span className="text-xs text-green-600 font-medium animate-pulse">Saved</span>
                    )}
                    {result !== null && (
                      <span className={`text-xs font-bold ${result ? "text-green-600" : "text-red-500"}`}>
                        {result ? "✓" : "✗"}
                      </span>
                    )}
                  </div>
                </div>

                {/* Score display for decided games */}
                {game.winning_team && game.away_score !== null && game.home_score !== null && (
                  <div className="text-center text-xs text-gray-500 pb-1">
                    Final: {game.away_team} {game.away_score} - {game.home_team} {game.home_score}
                  </div>
                )}

                {/* Pick buttons - underdog on left, favorite on right */}
                <div className="flex">
                  {(() => {
                    const underdogSide = game.favorite === "home" ? "away" : "home";
                    const favoriteSide = game.favorite as "away" | "home";
                    return (
                      <>
                        <PickButton
                          side={underdogSide}
                          position="left"
                          game={game}
                          pick={pick}
                          result={result}
                          isSaving={isSaving}
                          onPick={() => !game.is_locked && submitPick(game.id, underdogSide)}
                        />
                        <PickButton
                          side={favoriteSide}
                          position="right"
                          game={game}
                          pick={pick}
                          result={result}
                          isSaving={isSaving}
                          onPick={() => !game.is_locked && submitPick(game.id, favoriteSide)}
                        />
                      </>
                    );
                  })()}
                </div>

              </div>
            );
          })}

          {/* Tiebreaker section at bottom — styled like a game card */}
          {(() => {
            const tiebreakerGame = games.find((g) => g.is_tiebreaker);
            if (!tiebreakerGame) return null;
            const pick = getMyPick(tiebreakerGame.id);
            const isLocked = tiebreakerGame.is_locked;

            return (
              <div
                className={`mt-1 rounded-2xl border overflow-hidden transition-all ${
                  isLocked ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white shadow-sm"
                }`}
              >
                {/* Header */}
                <div className="px-3 pt-2.5 pb-1.5">
                  <p className="text-xs font-bold text-gray-900 uppercase tracking-wide">
                    Tiebreaker: <span className="font-normal normal-case tracking-normal text-gray-500">Closest to total points scored in {tiebreakerGame.away_team}/{tiebreakerGame.home_team} game</span>
                  </p>
                </div>

                {/* Teams + score input area */}
                <div className="flex items-center border-t border-gray-100">
                  {/* Away team */}
                  <div className="flex-1 py-3 px-3 text-center">
                    <span className="text-[10px] uppercase tracking-wider text-gray-400">Away</span>
                    {tiebreakerGame.away_logo_url && (
                      <img src={tiebreakerGame.away_logo_url} alt="" className="w-10 h-10 mx-auto my-1 object-contain" />
                    )}
                    <p className="text-sm font-semibold text-gray-900">{tiebreakerGame.away_team}</p>
                  </div>

                  {/* Score input in the middle */}
                  <div className="flex-1 py-3 px-2 text-center border-x border-gray-100">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Total Score</p>
                    {!isLocked && pick ? (
                      <TiebreakerInput
                        gameId={tiebreakerGame.id}
                        initialValue={pick.tiebreaker_total}
                        onSubmit={(total) => submitTiebreaker(tiebreakerGame.id, total)}
                      />
                    ) : !isLocked && !pick ? (
                      <p className="text-xs text-gray-400 italic mt-2">Pick a team above first</p>
                    ) : isLocked && pick && pick.tiebreaker_total !== null ? (
                      <p className="text-2xl font-bold text-gray-900 mt-1">{pick.tiebreaker_total}</p>
                    ) : (
                      <p className="text-xs text-gray-400 italic mt-2">Not submitted</p>
                    )}
                  </div>

                  {/* Home team */}
                  <div className="flex-1 py-3 px-3 text-center">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-gray-500">Home</span>
                    {tiebreakerGame.home_logo_url && (
                      <img src={tiebreakerGame.home_logo_url} alt="" className="w-10 h-10 mx-auto my-1 object-contain" />
                    )}
                    <p className="text-sm font-bold text-gray-900">{tiebreakerGame.home_team}</p>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      ) : (
        /* Leaderboard tab */
        <div>
          {/* Prize display */}
          {(() => {
            const paidCount = leaderboard.length;
            const pot = entryFee * paidCount;
            if (pot <= 0 || payoutPcts.length === 0) return null;

            const computed = payoutPcts
              .map((p) => ({
                place: p.place,
                rawAmount: (pot * p.percentage) / 100,
                amount: Math.floor((pot * p.percentage) / 100 / 5) * 5,
              }));
            // Distribute remaining $5 increments from 1st place down
            let remaining = pot - computed.reduce((s, c) => s + c.amount, 0);
            for (const c of computed) {
              if (remaining >= 5) { c.amount += 5; remaining -= 5; }
            }

            const placeLabel = (n: number) =>
              n === 1 ? "1st" : n === 2 ? "2nd" : n === 3 ? "3rd" : `${n}th`;

            return (
              <div className="flex items-center justify-center gap-4 mb-4">
                {computed.map((c) => (
                  <div key={c.place} className="text-center">
                    <p className="text-lg font-bold text-green-700">${c.amount}</p>
                    <p className="text-xs text-gray-400">{placeLabel(c.place)} place</p>
                  </div>
                ))}
              </div>
            );
          })()}

          {leaderboard.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No participants yet.</p>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-gray-100">
                {leaderboard.map((entry) => {
                  const isMe = entry.user_id === effectiveUserId;
                  return (
                    <div
                      key={entry.user_id}
                      className={`flex items-center gap-3 px-4 py-3 ${isMe ? "bg-green-50" : ""}`}
                    >
                      <span className="w-6 text-center text-sm font-bold text-gray-400">
                        {entry.rank}
                      </span>
                      {entry.avatar_url ? (
                        <img src={entry.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                          {entry.display_name[0]?.toUpperCase()}
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${isMe ? "text-green-800" : "text-gray-900"}`}>
                          {entry.display_name}
                          {isMe && <span className="text-xs text-green-600 ml-1">(you)</span>}
                        </p>
                        <p className="text-xs text-gray-400">
                          {entry.picks_count}/{totalGames} picked
                          {games.some((g) => g.is_locked) && entry.tiebreaker_total !== null && ` · TB: ${entry.tiebreaker_total}`}
                        </p>
                      </div>
                      <span className="text-2xl font-bold text-green-700">{entry.correct}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Tiebreaker input with debounced save
function TiebreakerInput({
  gameId,
  initialValue,
  onSubmit,
}: {
  gameId: string;
  initialValue: number | null;
  onSubmit: (total: number) => void;
}) {
  const [value, setValue] = useState(initialValue !== null ? String(initialValue) : "");
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const handleChange = (val: string) => {
    setValue(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    const num = parseInt(val);
    if (!isNaN(num) && num >= 0) {
      timerRef.current = setTimeout(() => onSubmit(num), 1000);
    }
  };

  return (
    <div className="flex justify-center">
      <input
        id={`tb-${gameId}`}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        value={value}
        onChange={(e) => handleChange(e.target.value.replace(/[^0-9]/g, ""))}
        autoFocus
        className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-xl font-bold text-center bg-white focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none"
        placeholder="0"
      />
    </div>
  );
}

// Pick button — underdog (left) or favorite (right)
function PickButton({
  side,
  position,
  game,
  pick,
  result,
  isSaving,
  onPick,
}: {
  side: "away" | "home";
  position: "left" | "right";
  game: Game;
  pick: Pick | undefined;
  result: boolean | null;
  isSaving: boolean;
  onPick: () => void;
}) {
  const isSelected = pick?.picked_team === side;
  const teamName = side === "away" ? game.away_team : game.home_team;
  const logoUrl = side === "away" ? game.away_logo_url : game.home_logo_url;
  const isFavorite = game.favorite === side;

  const spreadLabel = isFavorite
    ? `(${game.spread})`
    : `(+${Math.abs(game.spread)})`;

  let borderClass = position === "left" ? "border-t border-r border-gray-100" : "border-t border-gray-100";
  if (isSelected) {
    if (result === true) borderClass = position === "left" ? "border-t border-r border-green-200" : "border-t border-green-200";
    else if (result === false) borderClass = position === "left" ? "border-t border-r border-red-200" : "border-t border-red-200";
    else borderClass = position === "left" ? "border-t border-r border-gray-200" : "border-t border-gray-200";
  }

  return (
    <button
      onClick={onPick}
      disabled={game.is_locked || isSaving}
      className={`flex-1 py-3 px-3 text-center transition-all ${borderClass} ${
        game.is_locked ? "opacity-70" : "active:bg-gray-50"
      } ${isSelected ? (result === false ? "bg-red-50" : "bg-green-50") : ""}`}
    >
      <span className={`text-[10px] uppercase tracking-wider ${side === "home" ? "font-bold text-gray-500" : "text-gray-400"}`}>
        {side === "home" ? "Home" : "Away"}
      </span>
      {logoUrl && (
        <img src={logoUrl} alt="" className="w-10 h-10 mx-auto my-1 object-contain" />
      )}
      <p
        className={`text-sm ${side === "home" ? "font-bold" : "font-semibold"} ${isSelected ? "text-green-800" : "text-gray-900"}`}
      >
        {teamName}
      </p>
      <p className="text-xs text-gray-500 mt-0.5">{spreadLabel}</p>
    </button>
  );
}
