"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { CollapsibleSection } from "@/components/admin/CollapsibleSection";
import { ConfirmModal } from "@/components/admin/ConfirmModal";
import { ContestParticipantsAccordion } from "@/components/admin/ContestParticipantsAccordion";
import { FBS_TEAMS, getTeamLogoUrl, type FBSTeam } from "@/lib/data/fbs-teams";
import { BTN_NEUTRAL, BTN_PRIMARY } from "@/lib/ui/buttons";
import { computePickemPayouts } from "@/lib/pickem/payouts";

function SvgIcon({ src, className = "w-5 h-5" }: { src: string; className?: string }) {
  return (
    <div
      className={`${className} bg-current`}
      style={{
        WebkitMaskImage: `url(${src})`,
        WebkitMaskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        WebkitMaskPosition: "center",
        maskImage: `url(${src})`,
        maskSize: "contain",
        maskRepeat: "no-repeat",
        maskPosition: "center",
      }}
    />
  );
}

interface Game {
  id: string;
  contest_id: string;
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
  sort_order: number;
}

interface Participant {
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Settings {
  contest_id: string;
  entry_fee: number;
  payout_json: Array<{ place: number; percentage: number }>;
  is_open: boolean;
}

interface PickemPick {
  game_id: string;
  user_id: string;
  picked_team: string;
  tiebreaker_total: number | null;
}

interface Payment {
  user_id: string;
  paid: boolean;
  paid_at: string | null;
}

interface Standing {
  user_id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
  correct: number;
  total: number;
  decided: number;
  tiebreaker_total: number | null;
  tiebreaker_diff: number | null;
  rank: number;
}

// ============================================================
// Team Search Dropdown
// ============================================================
function TeamSelector({
  value,
  onChange,
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (team: FBSTeam) => void;
  placeholder: string;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = query.trim().length > 0
    ? FBS_TEAMS.filter(
        (t) =>
          t.shortName.toLowerCase().includes(query.toLowerCase()) ||
          t.name.toLowerCase().includes(query.toLowerCase()) ||
          t.abbreviation.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : [];

  const handleSelect = (team: FBSTeam) => {
    setQuery(team.shortName);
    setIsOpen(false);
    onChange(team);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.min(prev + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      handleSelect(filtered[highlightIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current) {
      const items = listRef.current.querySelectorAll("[data-team-item]");
      items[highlightIndex]?.scrollIntoView({ block: "nearest" });
    }
  }, [highlightIndex, isOpen]);

  return (
    <div className="relative flex-1">
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setIsOpen(true);
          setHighlightIndex(0);
        }}
        onFocus={() => {
          if (query.length > 0) setIsOpen(true);
        }}
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
        autoFocus={autoFocus}
      />
      {isOpen && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {filtered.map((team, i) => (
            <button
              key={team.abbreviation}
              data-team-item
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(team)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm ${
                i === highlightIndex ? "bg-green-50" : "hover:bg-gray-50"
              }`}
            >
              <img
                src={getTeamLogoUrl(team)}
                alt=""
                className="w-6 h-6 object-contain flex-shrink-0"
              />
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: team.primaryColor }}
              />
              <span className="font-medium">{team.shortName}</span>
              <span className="text-xs text-gray-400 truncate">{team.conference}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Compute payouts from percentages — single source for the algorithm
// is `@/lib/pickem/payouts` (issue #124). Keeps this UI and the winners
// materializer in lockstep.
function computePayouts(
  totalPot: number,
  percentages: Array<{ place: number; percentage: number }>
): Array<{ place: number; percentage: number; amount: number }> {
  const splits = percentages.map((p) => ({
    place: p.place,
    kind: "percentage" as const,
    amount: p.percentage,
  }));
  return computePickemPayouts(totalPot, splits);
}

// ============================================================
// Main PickemManager
// ============================================================
export function PickemManager({ tripId }: { tripId: string }) {
  const [contestId, setContestId] = useState<string | null>(null);
  const [saturdayDate, setSaturdayDate] = useState<string | null>(null); // "YYYY-MM-DD"
  const [games, setGames] = useState<Game[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [picks, setPicks] = useState<PickemPick[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [standings, setStandings] = useState<Standing[]>([]);
  const [winnerPayouts, setWinnerPayouts] = useState<Array<{ user_id: string; paid_out: boolean }>>([]);
  const [allGamesDecided, setAllGamesDecided] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingGame, setEditingGame] = useState<string | null>(null);
  const [resultGame, setResultGame] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Quick-add form state
  const [awayTeamObj, setAwayTeamObj] = useState<FBSTeam | null>(null);
  const [homeTeamObj, setHomeTeamObj] = useState<FBSTeam | null>(null);
  const [spread, setSpread] = useState("-3");
  const [favorite, setFavorite] = useState<"away" | "home">("home");
  const [gameTime, setGameTime] = useState("12:00"); // time only (HH:MM)
  const [tvChannel, setTvChannel] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);

  // Settings form state
  const [entryFee, setEntryFee] = useState("");
  const [payouts, setPayouts] = useState<Array<{ place: number; percentage: string }>>([]);
  const [isOpen, setIsOpen] = useState(false);

  // Helper: combine Saturday date + time into ISO string
  const buildGameTime = (time: string): string => {
    if (!saturdayDate) return new Date().toISOString();
    const [h, m] = time.split(":").map(Number);
    const [y, mo, d] = saturdayDate.split("-").map(Number);
    return new Date(y, mo - 1, d, h, m).toISOString();
  };

  // Helper: extract HH:MM from an ISO game_time
  const extractTime = (iso: string): string => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  // Find pickem contest for this trip + derive Saturday date
  useEffect(() => {
    async function findContest() {
      const res = await fetch(`/api/admin/events/${tripId}/summary`);
      const data = await res.json();

      // Derive Saturday = start_date + 3 days
      if (data.trip?.start_date) {
        const [y, m, d] = data.trip.start_date.split("-").map(Number);
        const sat = new Date(y, m - 1, d + 3);
        const satStr = `${sat.getFullYear()}-${String(sat.getMonth() + 1).padStart(2, "0")}-${String(sat.getDate()).padStart(2, "0")}`;
        setSaturdayDate(satStr);
      }

      if (data.contest_types?.includes("pickem")) {
        const contestRes = await fetch(`/api/admin/contests?trip_id=${tripId}`);
        const contestData = await contestRes.json();
        const pickem = (contestData.contests || []).find(
          (c: { contest_type: string }) => c.contest_type === "pickem"
        );
        if (pickem) {
          setContestId(pickem.id);
          // Don't clear loading yet — wait for fetchData below
          return;
        }
      }
      setLoading(false); // No contest found, stop loading
    }
    findContest();
  }, [tripId]);

  const fetchData = useCallback(async () => {
    if (!contestId) return;
    const res = await fetch(`/api/admin/pickem?contest_id=${contestId}`);
    const data = await res.json();
    setGames(data.games || []);
    setParticipants(
      (data.participants || []).sort((a: Participant, b: Participant) =>
        a.display_name.localeCompare(b.display_name)
      )
    );
    setPicks(data.picks || []);
    setPayments(data.payments || []);
    if (data.settings) {
      setSettings(data.settings);
      setEntryFee(String(data.settings.entry_fee || ""));
      setIsOpen(data.settings.is_open || false);
      setPayouts(
        (data.settings.payout_json || []).map((p: { place: number; percentage: number }) => ({
          place: p.place,
          percentage: String(p.percentage),
        }))
      );
    }
    setLoading(false);
  }, [contestId]);

  const fetchStandings = useCallback(async () => {
    if (!contestId) return;
    const [resultsRes, payoutsRes] = await Promise.all([
      fetch(`/api/admin/pickem/results?contest_id=${contestId}`),
      fetch(`/api/admin/pickem/payouts?contest_id=${contestId}`),
    ]);
    const resultsData = await resultsRes.json();
    const payoutsData = await payoutsRes.json();
    setStandings(resultsData.standings || []);
    setAllGamesDecided(resultsData.games_total > 0 && resultsData.games_decided === resultsData.games_total);
    setWinnerPayouts(payoutsData.payouts || []);
  }, [contestId]);

  useEffect(() => {
    if (contestId) {
      fetchData();
      fetchStandings();
    }
  }, [contestId, fetchData, fetchStandings]);

  const addGame = async () => {
    if (!contestId || !awayTeamObj || !homeTeamObj || !gameTime) return;

    setSaving("add");
    const res = await fetch("/api/admin/pickem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: contestId,
        away_team: awayTeamObj.shortName,
        home_team: homeTeamObj.shortName,
        away_logo_url: getTeamLogoUrl(awayTeamObj),
        home_logo_url: getTeamLogoUrl(homeTeamObj),
        away_color: awayTeamObj.primaryColor,
        home_color: homeTeamObj.primaryColor,
        spread: parseFloat(spread) || -3,
        favorite,
        game_time: buildGameTime(gameTime),
        tv_channel: tvChannel || null,
      }),
    });

    if (res.ok) {
      setAwayTeamObj(null);
      setHomeTeamObj(null);
      setSpread("-3");
      setFavorite("home");
      setGameTime("12:00");
      setTvChannel("");
      await fetchData();
    }
    setSaving(null);
  };

  const updateGame = async (id: string, updates: Partial<Game>) => {
    // Optimistic update for tiebreaker toggle
    if ("is_tiebreaker" in updates) {
      setGames((prev) =>
        prev.map((g) => {
          if (g.id === id) return { ...g, is_tiebreaker: !!updates.is_tiebreaker };
          // Clear tiebreaker from other games if setting one
          if (updates.is_tiebreaker) return { ...g, is_tiebreaker: false };
          return g;
        })
      );
    }

    setSaving(id);
    const res = await fetch("/api/admin/pickem", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    if (!res.ok) {
      // Revert on failure
      await fetchData();
    } else {
      await fetchData();
    }
    setSaving(null);
  };

  const deleteGame = (game: Game) => {
    setConfirmModal({
      title: "Delete Game",
      message: `Remove ${game.away_team} @ ${game.home_team}?`,
      onConfirm: async () => {
        setConfirmModal(null);
        setSaving(game.id);
        await fetch("/api/admin/pickem", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: game.id }),
        });
        await fetchData();
        await fetchStandings();
        setSaving(null);
      },
    });
  };

  const markResult = async (gameId: string, winningTeam: "away" | "home" | null, awayScore?: number, homeScore?: number) => {
    setSaving(gameId);
    await fetch("/api/admin/pickem/results", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: gameId,
        winning_team: winningTeam,
        away_score: awayScore ?? null,
        home_score: homeScore ?? null,
      }),
    });
    await fetchData();
    await fetchStandings();
    setResultGame(null);
    setSaving(null);
  };

  const saveSettings = async () => {
    if (!contestId) return;
    setSaving("settings");
    await fetch("/api/admin/pickem/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: contestId,
        entry_fee: parseFloat(entryFee) || 0,
        payout_json: payouts.map((p) => ({
          place: p.place,
          percentage: parseFloat(p.percentage) || 0,
        })),
        is_open: isOpen,
      }),
    });
    await fetchData();
    setSaving(null);
  };

  const toggleOpen = async () => {
    if (!contestId) return;
    const newValue = !isOpen;
    setIsOpen(newValue);
    setSaving("open");
    await fetch("/api/admin/pickem/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contest_id: contestId,
        entry_fee: parseFloat(entryFee) || 0,
        payout_json: payouts.map((p) => ({
          place: p.place,
          percentage: parseFloat(p.percentage) || 0,
        })),
        is_open: newValue,
      }),
    });
    await fetchData();
    setSaving(null);
  };

  const togglePayment = async (userId: string, paid: boolean) => {
    if (!contestId) return;

    // Optimistic update
    setPayments((prev) => {
      const existing = prev.find((p) => p.user_id === userId);
      if (existing) {
        return prev.map((p) => p.user_id === userId ? { ...p, paid, paid_at: paid ? new Date().toISOString() : null } : p);
      }
      return [...prev, { user_id: userId, paid, paid_at: paid ? new Date().toISOString() : null }];
    });

    const res = await fetch("/api/admin/pickem/payments", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contestId, user_id: userId, paid }),
    });

    if (!res.ok) await fetchData(); // revert on failure
  };

  const toggleWinnerPayout = async (userId: string, paidOut: boolean) => {
    if (!contestId) return;

    // Optimistic update
    setWinnerPayouts((prev) => {
      const existing = prev.find((p) => p.user_id === userId);
      if (existing) {
        return prev.map((p) => p.user_id === userId ? { ...p, paid_out: paidOut } : p);
      }
      return [...prev, { user_id: userId, paid_out: paidOut }];
    });

    const res = await fetch("/api/admin/pickem/payouts", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contest_id: contestId, user_id: userId, paid_out: paidOut }),
    });

    if (!res.ok) await fetchStandings(); // revert on failure
  };

  const formatSpread = (game: Game) => {
    const absSpread = Math.abs(game.spread);
    const sign = game.spread < 0 ? "-" : "+";
    return `${sign}${absSpread}`;
  };

  const formatGameTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="w-6 h-6 border-2 border-green-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!contestId) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No Pick&apos;em contest found for this event.</p>
        <p className="text-xs mt-1">Create one in the Contests section first.</p>
      </div>
    );
  }

  const paidCount = payments.filter((p) => p.paid).length;

  return (
    <div className="space-y-4">
      {/* ====== OPEN/CLOSE TOGGLE ====== */}
      <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-gray-900">Pick&apos;em Status</p>
          <p className="text-xs text-gray-500">
            {isOpen ? "Loozers can see games and make picks" : "Hidden from Loozers"}
          </p>
        </div>
        <button
          onClick={toggleOpen}
          disabled={saving === "open"}
          className={`relative w-12 h-7 rounded-full transition-colors ${
            isOpen ? "bg-green-600" : "bg-gray-300"
          }`}
        >
          <div
            className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${
              isOpen ? "translate-x-5" : "translate-x-0.5"
            }`}
          />
        </button>
      </div>

      {/* ====== ESPN SCHEDULE LINK ====== */}
      {saturdayDate && (
        <a
          href={(() => {
            const d = new Date(saturdayDate + "T00:00:00");
            const label = d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
            return `https://www.espn.com/college-football/schedule/_/week/1/year/${saturdayDate.slice(0, 4)}/seasontype/2#:~:text=${encodeURIComponent(label)}`;
          })()}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 bg-white rounded-2xl border border-gray-200 shadow-sm px-4 py-3 active:bg-gray-50 transition-colors"
        >
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-red-50 flex-shrink-0">
            <img
              src="/espn.png"
              alt="ESPN"
              className="w-6 h-6 object-contain"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900">ESPN Schedule</p>
            <p className="text-xs text-gray-500">
              View{" "}
              {new Date(saturdayDate + "T00:00:00").toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })}
              &apos;s college football games
            </p>
          </div>
          <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </a>
      )}

      {/* ====== PARTICIPANTS ====== */}
      {contestId && (
        <ContestParticipantsAccordion
          tripId={tripId}
          contestName="Pick'em"
          contestId={contestId}
          contestType="pickem"
          onChanged={fetchData}
        />
      )}

      {/* ====== GAMES ====== */}
      <CollapsibleSection
        title="Games"
        summary={`${games.length} game${games.length !== 1 ? "s" : ""}`}
        defaultOpen
        icon={
          <SvgIcon src="/noun-american-football-2591628.svg" />
        }
      >
        {/* Quick-add toggle */}
        <div className="flex justify-end mb-3">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className={showAddForm ? BTN_NEUTRAL : BTN_PRIMARY}
          >
            {showAddForm ? "Cancel" : "+ Add Game"}
          </button>
        </div>

        {/* Quick-add form */}
        {showAddForm && (
          <div className="bg-gray-50 rounded-xl p-3 mb-4 space-y-3">
            <div className="flex gap-2 items-center">
              <TeamSelector
                value={awayTeamObj?.shortName || ""}
                onChange={setAwayTeamObj}
                placeholder="Away Team"
                autoFocus
              />
              <span className="text-xs text-gray-400 flex-shrink-0">@</span>
              <TeamSelector
                value={homeTeamObj?.shortName || ""}
                onChange={setHomeTeamObj}
                placeholder="Home Team"
              />
            </div>

            {/* Show selected team logos */}
            {(awayTeamObj || homeTeamObj) && (
              <div className="flex items-center justify-center gap-4">
                {awayTeamObj && (
                  <div className="flex items-center gap-1.5">
                    <img src={getTeamLogoUrl(awayTeamObj)} alt="" className="w-8 h-8 object-contain" />
                    <span className="text-xs font-medium">{awayTeamObj.shortName}</span>
                  </div>
                )}
                {awayTeamObj && homeTeamObj && <span className="text-gray-400 text-xs">vs</span>}
                {homeTeamObj && (
                  <div className="flex items-center gap-1.5">
                    <img src={getTeamLogoUrl(homeTeamObj)} alt="" className="w-8 h-8 object-contain" />
                    <span className="text-xs font-medium">{homeTeamObj.shortName}</span>
                  </div>
                )}
              </div>
            )}

            <div className="flex gap-2 items-center">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Spread</label>
                <input
                  type="number"
                  step="0.5"
                  value={spread}
                  onChange={(e) => setSpread(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Favorite</label>
                <div className="flex rounded-lg overflow-hidden border border-gray-300">
                  <button
                    type="button"
                    onClick={() => setFavorite("away")}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      favorite === "away"
                        ? "bg-green-600 text-white"
                        : "bg-white text-gray-600"
                    }`}
                  >
                    {awayTeamObj?.shortName || "Away"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setFavorite("home")}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      favorite === "home"
                        ? "bg-green-600 text-white"
                        : "bg-white text-gray-600"
                    }`}
                  >
                    {homeTeamObj?.shortName || "Home"}
                  </button>
                </div>
              </div>
            </div>

            {saturdayDate && (
              <p className="text-xs text-gray-400">
                All games on Saturday,{" "}
                {new Date(saturdayDate + "T00:00:00").toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                })}
              </p>
            )}

            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">Kickoff Time</label>
                <input
                  type="time"
                  value={gameTime}
                  onChange={(e) => setGameTime(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 block mb-1">TV (optional)</label>
                <input
                  type="text"
                  placeholder="ESPN"
                  value={tvChannel}
                  onChange={(e) => setTvChannel(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>

            <button
              onClick={addGame}
              disabled={!awayTeamObj || !homeTeamObj || !gameTime || saving === "add"}
              className="w-full bg-green-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              {saving === "add" ? "Adding..." : "Add Game"}
            </button>
          </div>
        )}

        {/* Game list */}
        {games.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No games yet. Tap &quot;+ Add Game&quot; to get started.</p>
        ) : (
          <div className="space-y-2">
            {games.map((game) => (
              <GameCard
                key={game.id}
                game={game}
                saving={saving}
                editingGame={editingGame}
                resultGame={resultGame}
                saturdayDate={saturdayDate}
                formatSpread={formatSpread}
                formatGameTime={formatGameTime}
                buildGameTime={buildGameTime}
                extractTime={extractTime}
                onEdit={(id) => setEditingGame(editingGame === id ? null : id)}
                onResult={(id) => setResultGame(resultGame === id ? null : id)}
                onUpdate={updateGame}
                onDelete={() => deleteGame(game)}
                onMarkResult={markResult}
              />
            ))}
          </div>
        )}
      </CollapsibleSection>

      {/* ====== STANDINGS ====== */}
      <CollapsibleSection
        title="Standings"
        summary={`${standings.length} player${standings.length !== 1 ? "s" : ""}`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        }
      >
        {allGamesDecided && payouts.length > 0 && (
          <p className="text-xs text-gray-500 mb-2">Check the box to mark winners as paid out.</p>
        )}
        {standings.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No picks yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {standings.map((s) => {
              const prizeCount = payouts.length;
              const isWinner = s.rank <= prizeCount;
              const payout = winnerPayouts.find((p) => p.user_id === s.user_id);
              const isPaidOut = payout?.paid_out || false;

              return (
                <div key={s.user_id} className={`flex items-center gap-3 py-2 ${isWinner && allGamesDecided ? "bg-green-50" : ""}`}>
                  <span className="w-6 text-center text-sm font-bold text-gray-400">
                    {s.rank}
                  </span>
                  {s.avatar_url ? (
                    <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                      {s.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.display_name}</p>
                    <p className="text-xs text-gray-400">
                      {s.correct}/{s.decided} correct
                      {s.tiebreaker_total !== null && ` · TB: ${s.tiebreaker_total}`}
                      {s.tiebreaker_diff !== null && ` (off by ${s.tiebreaker_diff})`}
                    </p>
                  </div>
                  <span className="text-lg font-bold text-green-700">{s.correct}</span>
                  {isWinner && allGamesDecided && (
                    <button
                      onClick={() => toggleWinnerPayout(s.user_id, !isPaidOut)}
                      className="flex items-center ml-1"
                      title={isPaidOut ? "Paid" : "Mark as paid"}
                    >
                      <div
                        className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                          isPaidOut ? "bg-green-600 border-green-600" : "border-gray-300"
                        }`}
                      >
                        {isPaidOut && (
                          <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* ====== SETTINGS ====== */}
      <CollapsibleSection
        title="Settings"
        summary={settings?.entry_fee ? `$${settings.entry_fee} entry` : "Configure"}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 block mb-1">Entry Fee ($)</label>
            <input
              type="number"
              step="1"
              value={entryFee}
              onChange={(e) => setEntryFee(e.target.value)}
              className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="20"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs text-gray-500">Payouts (% of pot)</label>
              <button
                onClick={() =>
                  setPayouts([...payouts, { place: payouts.length + 1, percentage: "" }])
                }
                className="text-xs text-green-700 font-medium"
              >
                + Add
              </button>
            </div>
            {payouts.map((p, i) => (
              <div key={i} className="flex items-center gap-2 mb-2">
                <span className="text-xs text-gray-500 w-10">
                  {p.place === 1 ? "1st" : p.place === 2 ? "2nd" : p.place === 3 ? "3rd" : `${p.place}th`}
                </span>
                <div className="relative w-20">
                  <input
                    type="number"
                    step="5"
                    value={p.percentage}
                    onChange={(e) => {
                      const updated = [...payouts];
                      updated[i].percentage = e.target.value;
                      setPayouts(updated);
                    }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm pr-7"
                    placeholder="0"
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-400">%</span>
                </div>
                <button
                  onClick={() => setPayouts(payouts.filter((_, j) => j !== i))}
                  className="text-xs text-red-500"
                >
                  Remove
                </button>
              </div>
            ))}

            {/* Computed payout preview */}
            {(() => {
              const paidCount = payments.filter((pay) => pay.paid).length;
              const fee = parseFloat(entryFee) || 0;
              const pot = fee * paidCount;
              const parsed = payouts.map((p) => ({
                place: p.place,
                percentage: parseFloat(p.percentage) || 0,
              }));
              const totalPct = parsed.reduce((s, p) => s + p.percentage, 0);
              const computed = computePayouts(pot, parsed);
              const totalPaid = computed.reduce((s, c) => s + c.amount, 0);

              if (parsed.length === 0 || pot === 0) return null;

              return (
                <div className="mt-3 bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500 mb-2">
                    Pot: ${fee} x {paidCount} paid = <span className="font-semibold text-gray-700">${pot}</span>
                    {totalPct !== 100 && (
                      <span className="text-amber-600 ml-2">({totalPct}% allocated)</span>
                    )}
                  </p>
                  {computed.map((c) => (
                    <div key={c.place} className="flex justify-between text-sm">
                      <span className="text-gray-600">
                        {c.place === 1 ? "1st" : c.place === 2 ? "2nd" : c.place === 3 ? "3rd" : `${c.place}th`} ({c.percentage}%)
                      </span>
                      <span className="font-semibold text-gray-900">${c.amount}</span>
                    </div>
                  ))}
                  {totalPaid !== pot && totalPct === 100 && (
                    <p className="text-xs text-gray-400 mt-1">
                      ${pot - totalPaid} unallocated from rounding
                    </p>
                  )}
                </div>
              );
            })()}
          </div>

          <button
            onClick={saveSettings}
            disabled={saving === "settings"}
            className="bg-green-600 text-white rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {saving === "settings" ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </CollapsibleSection>

      {/* ====== PAYMENTS ====== */}
      <CollapsibleSection
        title="Payments"
        summary={`${paidCount}/${participants.length} paid`}
        icon={
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        }
      >
        {participants.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">No participants yet.</p>
        ) : (
          <div className="divide-y divide-gray-100">
            {participants.map((p) => {
              const payment = payments.find((pay) => pay.user_id === p.user_id);
              const isPaid = payment?.paid || false;
              return (
                <div key={p.user_id} className="flex items-center gap-3 py-2">
                  {p.avatar_url ? (
                    <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-xs font-bold text-gray-500">
                      {p.display_name[0]?.toUpperCase()}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900">{p.display_name}</span>
                    <p className="text-xs text-gray-400">
                      {picks.filter((pk) => pk.user_id === p.user_id).length}/{games.length} picks
                    </p>
                  </div>
                  <button
                    onClick={() => togglePayment(p.user_id, !isPaid)}
                    disabled={saving === `pay-${p.user_id}`}
                    className="flex items-center"
                  >
                    <div
                      className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
                        isPaid ? "bg-green-600 border-green-600" : "border-gray-300"
                      }`}
                    >
                      {isPaid && (
                        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                        </svg>
                      )}
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      {/* ====== RESET ====== */}
      <button
        onClick={() =>
          setConfirmModal({
            title: "Reset Pick'em",
            message: "This will delete all games, picks, and payment records. This cannot be undone. Are you sure?",
            onConfirm: async () => {
              setConfirmModal(null);
              setSaving("reset");
              await fetch("/api/admin/pickem/reset", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contest_id: contestId }),
              });
              await fetchData();
              await fetchStandings();
              setSaving(null);
            },
          })
        }
        disabled={saving === "reset"}
        className="w-full py-3 text-sm font-medium text-red-600 border border-red-200 rounded-2xl active:bg-red-50 transition-colors"
      >
        {saving === "reset" ? "Resetting..." : "Reset Pick'em"}
      </button>

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        onConfirm={confirmModal?.onConfirm || (() => {})}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}

// ============================================================
// GameCard sub-component
// ============================================================
function GameCard({
  game,
  saving,
  editingGame,
  resultGame,
  saturdayDate,
  formatSpread,
  formatGameTime,
  buildGameTime,
  extractTime,
  onEdit,
  onResult,
  onUpdate,
  onDelete,
  onMarkResult,
}: {
  game: Game;
  saving: string | null;
  editingGame: string | null;
  resultGame: string | null;
  saturdayDate: string | null;
  formatSpread: (g: Game) => string;
  formatGameTime: (iso: string) => string;
  buildGameTime: (time: string) => string;
  extractTime: (iso: string) => string;
  onEdit: (id: string) => void;
  onResult: (id: string) => void;
  onUpdate: (id: string, updates: Partial<Game>) => void;
  onDelete: () => void;
  onMarkResult: (id: string, winner: "away" | "home" | null, awayScore?: number, homeScore?: number) => void;
}) {
  const isEditing = editingGame === game.id;
  const isResult = resultGame === game.id;
  const [editSpread, setEditSpread] = useState(String(game.spread));
  const [editFavorite, setEditFavorite] = useState(game.favorite);
  const [editTime, setEditTime] = useState(
    game.game_time ? extractTime(game.game_time) : "12:00"
  );
  const [editTv, setEditTv] = useState(game.tv_channel || "");
  const [resultAwayScore, setResultAwayScore] = useState(
    game.away_score !== null ? String(game.away_score) : ""
  );
  const [resultHomeScore, setResultHomeScore] = useState(
    game.home_score !== null ? String(game.home_score) : ""
  );

  const spreadDisplay = formatSpread(game);
  const favTeam = game.favorite === "away" ? game.away_team : game.home_team;

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Game summary row */}
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-2">
          {/* Team logos */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {game.away_logo_url && (
              <img src={game.away_logo_url} alt="" className="w-6 h-6 object-contain" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-semibold text-gray-900 truncate">
                {game.away_team}
              </span>
              <span className="text-xs text-gray-400">@</span>
              <span className="text-sm font-semibold text-gray-900 truncate">
                {game.home_team}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-xs text-gray-500">
                {favTeam} {spreadDisplay}
              </span>
              {game.tv_channel && (
                <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
                  {game.tv_channel}
                </span>
              )}
              <span className="text-xs text-gray-400">{formatGameTime(game.game_time)}</span>
            </div>
          </div>
          {/* Right side logos + badges */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {game.home_logo_url && (
              <img src={game.home_logo_url} alt="" className="w-6 h-6 object-contain" />
            )}
            {game.winning_team && (
              <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-medium">
                {game.winning_team === "away" ? game.away_team : game.home_team}
                {game.away_score !== null && game.home_score !== null && (
                  <> ({game.away_score}-{game.home_score})</>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mt-2">
          <button onClick={() => onEdit(game.id)} className="flex-1 py-2 rounded-lg text-sm font-medium bg-blue-50 text-blue-700 active:bg-blue-100">
            {isEditing ? "Cancel" : "Edit"}
          </button>
          <button onClick={() => onResult(game.id)} className="flex-1 py-2 rounded-lg text-sm font-medium bg-purple-50 text-purple-700 active:bg-purple-100">
            {isResult ? "Cancel" : "Result"}
          </button>
          <button
            onClick={() => onUpdate(game.id, { is_tiebreaker: !game.is_tiebreaker })}
            disabled={saving === game.id}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${game.is_tiebreaker ? "bg-amber-100 text-amber-700 active:bg-amber-200" : "bg-gray-100 text-gray-500 active:bg-gray-200"}`}
          >
            {game.is_tiebreaker ? "★ TB" : "☆ TB"}
          </button>
          <button onClick={onDelete} className="py-2 px-3 rounded-lg text-sm font-medium bg-red-50 text-red-600 active:bg-red-100">
            Delete
          </button>
        </div>
      </div>

      {/* Inline edit form — spread, favorite, time, TV only (team names set at creation) */}
      {isEditing && (
        <div className="border-t border-gray-100 px-3 py-3 bg-gray-50 space-y-2">
          <div className="flex gap-2">
            <input
              type="number"
              step="0.5"
              value={editSpread}
              onChange={(e) => setEditSpread(e.target.value)}
              className="w-20 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              placeholder="Spread"
            />
            <select
              value={editFavorite}
              onChange={(e) => setEditFavorite(e.target.value as "away" | "home")}
              className="border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              style={{ backgroundColor: "transparent" }}
            >
              <option value="away">{game.away_team} fav</option>
              <option value="home">{game.home_team} fav</option>
            </select>
            <input
              type="time"
              value={editTime}
              onChange={(e) => setEditTime(e.target.value)}
              className="w-28 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={editTv}
              onChange={(e) => setEditTv(e.target.value)}
              className="flex-1 border border-gray-300 rounded-lg px-2 py-1.5 text-sm"
              placeholder="TV Channel"
            />
            <button
              onClick={() => {
                onUpdate(game.id, {
                  spread: parseFloat(editSpread) as unknown as number,
                  favorite: editFavorite,
                  game_time: buildGameTime(editTime),
                  tv_channel: editTv || null,
                });
                onEdit(game.id);
              }}
              disabled={saving === game.id}
              className="bg-green-600 text-white rounded-lg px-4 py-1.5 text-sm font-medium disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* Result form */}
      {isResult && (
        <div className="border-t border-gray-100 px-3 py-3 bg-purple-50 space-y-2">
          <div className="flex gap-2 items-center">
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {game.away_logo_url && <img src={game.away_logo_url} alt="" className="w-5 h-5 object-contain" />}
                <p className="text-xs text-gray-500">{game.away_team}</p>
              </div>
              <input
                type="number"
                value={resultAwayScore}
                onChange={(e) => setResultAwayScore(e.target.value)}
                className="w-16 mx-auto border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
                placeholder="0"
              />
            </div>
            <span className="text-gray-400 text-sm">-</span>
            <div className="flex-1 text-center">
              <div className="flex items-center justify-center gap-1 mb-1">
                {game.home_logo_url && <img src={game.home_logo_url} alt="" className="w-5 h-5 object-contain" />}
                <p className="text-xs text-gray-500">{game.home_team}</p>
              </div>
              <input
                type="number"
                value={resultHomeScore}
                onChange={(e) => setResultHomeScore(e.target.value)}
                className="w-16 mx-auto border border-gray-300 rounded-lg px-2 py-1.5 text-sm text-center"
                placeholder="0"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => {
                const as = parseInt(resultAwayScore);
                const hs = parseInt(resultHomeScore);
                const winner = as > hs ? "away" : hs > as ? "home" : null;
                onMarkResult(game.id, winner, isNaN(as) ? undefined : as, isNaN(hs) ? undefined : hs);
              }}
              disabled={saving === game.id}
              className="flex-1 bg-purple-600 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            >
              Save Result
            </button>
            {game.winning_team && (
              <button
                onClick={() => onMarkResult(game.id, null)}
                disabled={saving === game.id}
                className="px-3 border border-gray-300 rounded-lg text-sm text-gray-600 disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
