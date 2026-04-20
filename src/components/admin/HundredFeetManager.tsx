"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { ConfirmModal } from "./ConfirmModal";
import { ContestParticipantsAccordion } from "./ContestParticipantsAccordion";

interface Participant {
  id: string;
  display_name: string;
  full_name: string | null;
  avatar_url: string | null;
}

interface Score {
  user_id: string;
  day_number: number;
  feet: number;
  inches: number;
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function toInches(feet: number, inches: number): number {
  return feet * 12 + inches;
}

function formatDistance(feet: number, inches: number): string {
  return `${feet}'${inches}"`;
}

function formatTotalInches(totalInches: number): string {
  const f = Math.floor(totalInches / 12);
  const i = totalInches % 12;
  return `${f}'${i}"`;
}

export function HundredFeetManager({ tripId }: { tripId: string }) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [enrolledIds, setEnrolledIds] = useState<Set<string>>(new Set());
  const [contestId, setContestId] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, Score>>({});
  const [scrambleDayNumbers, setScrambleDayNumbers] = useState<number[]>([]);
  const [startDate, setStartDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [showRealNames, setShowRealNames] = useState(false);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [dataEntryOpen, setDataEntryOpen] = useState(false);
  const [sortKey, setSortKey] = useState<string>("total");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const initializedRef = useRef(false);
  const dirtyRef = useRef<Map<string, Score>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scoreKey = (userId: string, day: number) => `${userId}-${day}`;

  const getDayOfWeek = (dayNum: number, style: "long" | "short"): string => {
    if (!startDate) return `Day ${dayNum}`;
    const [year, month, day] = startDate.split("-").map(Number);
    const date = new Date(year, month - 1, day + dayNum - 1);
    return date.toLocaleDateString("en-US", { weekday: style });
  };

  const DAYS = scrambleDayNumbers.map((dayNum) => ({
    day: dayNum,
    label: getDayOfWeek(dayNum, "long"),
    short: getDayOfWeek(dayNum, "short"),
  }));

  const fetchScrambleDays = useCallback(async () => {
    const [contestsRes, summaryRes] = await Promise.all([
      fetch(`/api/admin/contests?trip_id=${tripId}`),
      fetch(`/api/admin/events/${tripId}/summary`),
    ]);
    const contestsData = await contestsRes.json();
    const summaryData = await summaryRes.json();

    if (summaryData.trip?.start_date) {
      setStartDate(summaryData.trip.start_date);
    }

    const contests = contestsData.contests || [];
    const dayNums = [
      ...new Set(
        contests
          .filter((c: { contest_type: string; day_number: number | null }) => c.contest_type === "scramble" && c.day_number != null)
          .map((c: { day_number: number }) => c.day_number)
      ),
    ] as number[];
    dayNums.sort((a, b) => a - b);
    setScrambleDayNumbers(dayNums);

    // One-time initialization: pick the right tab and decide if accordion opens
    if (dayNums.length > 0 && !initializedRef.current) {
      initializedRef.current = true;

      const tripStart = summaryData.trip?.start_date;
      const simDate = summaryData.trip?.sim_date;
      let todayDayNum: number | null = null;

      if (tripStart) {
        const [sy, sm, sd] = tripStart.split("-").map(Number);
        let today: Date;
        if (simDate) {
          const datePart = simDate.includes("T") ? simDate.split("T")[0] : simDate;
          const [ey, em, ed] = datePart.split("-").map(Number);
          today = new Date(ey, em - 1, ed);
        } else {
          const now = new Date();
          today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        }
        const start = new Date(sy, sm - 1, sd);
        const diffDays = Math.round((today.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
        const currentDayNum = diffDays + 1;
        if (dayNums.includes(currentDayNum)) {
          todayDayNum = currentDayNum;
        }
      }

      if (todayDayNum !== null) {
        setSelectedDay(todayDayNum);
        setDataEntryOpen(true);
      } else {
        setSelectedDay(dayNums[0]);
      }
    }
  }, [tripId]);

  const fetchData = useCallback(async () => {
    const res = await fetch(`/api/admin/hundred-feet?trip_id=${tripId}`);
    const data = await res.json();

    setParticipants(data.participants || []);
    setEnrolledIds(new Set<string>(data.contest_participant_ids || []));
    setContestId(data.contest_id || null);

    const scoreMap: Record<string, Score> = {};
    for (const s of data.scores || []) {
      scoreMap[scoreKey(s.user_id, s.day_number)] = {
        user_id: s.user_id,
        day_number: s.day_number,
        feet: s.feet,
        inches: s.inches,
      };
    }
    setScores(scoreMap);
    setLoading(false);
  }, [tripId]);

  useEffect(() => {
    fetchScrambleDays();
    fetchData();
  }, [fetchScrambleDays, fetchData]);

  useEffect(() => {
    const handleContests = () => fetchScrambleDays();
    window.addEventListener("contests-changed", handleContests);
    return () => {
      window.removeEventListener("contests-changed", handleContests);
    };
  }, [fetchScrambleDays]);

  const flush = useCallback(async () => {
    const dirty = Array.from(dirtyRef.current.values());
    if (dirty.length === 0) return;

    dirtyRef.current.clear();
    setSaveStatus("saving");

    try {
      const res = await fetch("/api/admin/hundred-feet", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trip_id: tripId, scores: dirty }),
      });

      if (!res.ok) throw new Error("Save failed");

      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  }, [tripId]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      const dirty = Array.from(dirtyRef.current.values());
      if (dirty.length > 0) {
        fetch("/api/admin/hundred-feet", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ trip_id: tripId, scores: dirty }),
        });
      }
    };
  }, [tripId]);

  const scheduleSave = () => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(flush, 500);
  };

  const updateScore = (userId: string, day: number, field: "feet" | "inches", value: number) => {
    const key = scoreKey(userId, day);
    const existing = scores[key] || { user_id: userId, day_number: day, feet: 100, inches: 0 };
    const updated = { ...existing, [field]: value };

    setScores((prev) => ({ ...prev, [key]: updated }));
    dirtyRef.current.set(key, updated);
    scheduleSave();
  };

  const activeParticipants = participants.filter((p) => enrolledIds.has(p.id));

  const fillDay = (day: number) => {
    const newScores: Record<string, Score> = { ...scores };
    for (const p of activeParticipants) {
      const key = scoreKey(p.id, day);
      if (newScores[key]) continue;
      const score: Score = { user_id: p.id, day_number: day, feet: 100, inches: 0 };
      newScores[key] = score;
      dirtyRef.current.set(key, score);
    }
    setScores(newScores);
    scheduleSave();
  };

  const clearDay = async (day: number) => {
    setSaveStatus("saving");
    try {
      const res = await fetch(`/api/admin/hundred-feet?trip_id=${tripId}&day_number=${day}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Clear failed");

      // Remove local scores for this day
      setScores((prev) => {
        const next = { ...prev };
        for (const p of activeParticipants) {
          delete next[scoreKey(p.id, day)];
        }
        return next;
      });
      // Clear any pending dirty entries for this day
      for (const p of activeParticipants) {
        dirtyRef.current.delete(scoreKey(p.id, day));
      }

      setSaveStatus("saved");
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSaveStatus("idle"), 2000);
    } catch {
      setSaveStatus("error");
    }
  };

  const isDayFilled = (day: number) => {
    if (activeParticipants.length === 0) return false;
    return activeParticipants.every((p) => !!scores[scoreKey(p.id, day)]);
  };

  const isDayEmpty = (day: number) => {
    return activeParticipants.every((p) => !scores[scoreKey(p.id, day)]);
  };

  // ── Leaderboard ──

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "player" ? "asc" : "asc");
    }
  };

  const leaderboard = activeParticipants.map((p) => {
    const dayScores: Record<number, { feet: number; inches: number; totalInches: number }> = {};
    let grandTotal = 0;
    for (const d of scrambleDayNumbers) {
      const s = scores[scoreKey(p.id, d)];
      if (s) {
        const ti = toInches(s.feet, s.inches);
        dayScores[d] = { feet: s.feet, inches: s.inches, totalInches: ti };
        grandTotal += ti;
      }
    }
    const hasData = Object.keys(dayScores).length > 0;
    return { ...p, dayScores, grandTotal, hasData };
  });

  // Rank map (always by total ascending — lower = better, no-data unranked)
  const withData = leaderboard.filter((e) => e.hasData);
  const rankSorted = [...withData].sort((a, b) => a.grandTotal - b.grandTotal);
  const rankMap = new Map<string, number>();
  rankSorted.forEach((e, i) => rankMap.set(e.id, i + 1));

  const sorted = [...leaderboard].sort((a, b) => {
    // No-data players always sink to the bottom
    if (a.hasData !== b.hasData) return a.hasData ? -1 : 1;

    let cmp = 0;
    if (sortKey === "player") {
      cmp = a.display_name.localeCompare(b.display_name);
    } else if (sortKey === "total") {
      cmp = a.grandTotal - b.grandTotal;
    } else if (sortKey.startsWith("day-")) {
      const d = parseInt(sortKey.slice(4), 10);
      const aVal = a.dayScores[d]?.totalInches ?? 99999;
      const bVal = b.dayScores[d]?.totalInches ?? 99999;
      cmp = aVal - bVal;
    }
    return sortDir === "desc" ? -cmp : cmp;
  });

  const SortArrow = ({ col }: { col: string }) => {
    if (sortKey !== col) return null;
    return <span className="ml-0.5">{sortDir === "asc" ? "↑" : "↓"}</span>;
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-6 h-6 border-2 border-red-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const dayLabel = DAYS.find((d) => d.day === selectedDay)?.label || "";

  return (
    <div className="space-y-4">
      {/* ── Participants Accordion ── */}
      {contestId && (
        <ContestParticipantsAccordion
          tripId={tripId}
          contestName="100 Feet!"
          contestId={contestId}
          onChanged={fetchData}
        />
      )}

      {/* ── Data Entry Accordion ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setDataEntryOpen(!dataEntryOpen)}
          className="w-full flex items-center justify-between px-4 py-3 active:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-gray-900">Data Entry</span>
            {saveStatus === "saving" && (
              <div className="w-3 h-3 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            )}
            {saveStatus === "saved" && (
              <svg className="w-3.5 h-3.5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {saveStatus === "error" && (
              <span className="text-[10px] text-red-500 font-medium">Error</span>
            )}
          </div>
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform ${dataEntryOpen ? "rotate-180" : ""}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {dataEntryOpen && (
          <div className="border-t border-gray-200 px-4 py-3 space-y-3">
            {/* Day Tabs */}
            <div className="flex rounded-xl bg-gray-100 p-1 gap-1">
              {DAYS.map((d) => (
                <button
                  key={d.day}
                  onClick={() => setSelectedDay(d.day)}
                  className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
                    selectedDay === d.day
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 active:bg-gray-200"
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>

            {/* Fill / Clear buttons */}
            {selectedDay !== null && (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowRealNames(!showRealNames)}
                    className="text-xs text-gray-500 underline"
                  >
                    {showRealNames ? "Nicknames" : "Real names"}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {!isDayFilled(selectedDay) && (
                    <button
                      onClick={() => fillDay(selectedDay)}
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-blue-50 text-blue-600 active:bg-blue-100"
                    >
                      Fill 100&apos;0&quot;
                    </button>
                  )}
                  {!isDayEmpty(selectedDay) && (
                    <button
                      onClick={() =>
                        setConfirmModal({
                          title: `Clear ${dayLabel}`,
                          message: `This will remove all 100 Feet scores for ${dayLabel}. This cannot be undone.`,
                          onConfirm: () => clearDay(selectedDay),
                        })
                      }
                      className="px-2.5 py-1 text-xs font-medium rounded-lg bg-red-50 text-red-600 active:bg-red-100"
                    >
                      Clear Day
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Participant score list for selected day */}
            {selectedDay !== null && activeParticipants.length === 0 && (
              <div className="text-xs text-gray-400 text-center py-4">
                No participants enrolled yet. Use the Participants section above to add Loozers.
              </div>
            )}
            {selectedDay !== null && activeParticipants.length > 0 && (
              <div className="space-y-1">
                {activeParticipants.map((p) => {
                  const key = scoreKey(p.id, selectedDay);
                  const s = scores[key];

                  return (
                    <div key={p.id} className="flex items-center gap-2 py-1.5">
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        {p.avatar_url ? (
                          <img src={p.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                        ) : (
                          <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold flex-shrink-0">
                            {(p.display_name || "?")[0].toUpperCase()}
                          </span>
                        )}
                        <span className="text-xs font-medium text-gray-900 truncate">
                          {showRealNames ? (p.full_name || p.display_name) : p.display_name}
                        </span>
                      </div>
                      {s ? (
                        <div className="flex items-center gap-0.5">
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={100}
                            value={s.feet}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(100, parseInt(e.target.value) || 0));
                              updateScore(p.id, selectedDay, "feet", v);
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-12 text-center text-sm border border-gray-200 rounded-lg py-1.5 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                          />
                          <span className="text-xs text-gray-400">&apos;</span>
                          <input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={11}
                            value={s.inches}
                            onChange={(e) => {
                              const v = Math.max(0, Math.min(11, parseInt(e.target.value) || 0));
                              updateScore(p.id, selectedDay, "inches", v);
                            }}
                            onFocus={(e) => e.target.select()}
                            className="w-10 text-center text-sm border border-gray-200 rounded-lg py-1.5 focus:border-green-500 focus:ring-1 focus:ring-green-500 outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                          />
                          <span className="text-xs text-gray-400">&quot;</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-300 pr-2">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Leaderboard ── */}
      {leaderboard.some((e) => e.grandTotal > 0) && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <span className="text-sm font-semibold text-gray-900">Leaderboard</span>
          </div>

          {/* Header */}
          <div
            className="grid gap-0 bg-gray-50 text-[10px] font-semibold text-gray-500 uppercase select-none border-b border-gray-100"
            style={{ gridTemplateColumns: `1.5rem 1fr repeat(${DAYS.length}, 3.5rem) 3.5rem` }}
          >
            <div
              className="px-1 py-2 text-center cursor-pointer active:bg-gray-100"
              onClick={() => handleSort("total")}
            >
              #<SortArrow col="total" />
            </div>
            <div
              className="px-2 py-2 cursor-pointer active:bg-gray-100"
              onClick={() => handleSort("player")}
            >
              Player<SortArrow col="player" />
            </div>
            {DAYS.map((d) => (
              <div
                key={d.day}
                className="px-1 py-2 text-center cursor-pointer active:bg-gray-100"
                onClick={() => handleSort(`day-${d.day}`)}
              >
                {d.short}<SortArrow col={`day-${d.day}`} />
              </div>
            ))}
            <div
              className="px-1 py-2 text-center cursor-pointer active:bg-gray-100"
              onClick={() => handleSort("total")}
            >
              Total<SortArrow col="total" />
            </div>
          </div>

          {/* Rows */}
          {sorted.map((entry) => {
            const rank = rankMap.get(entry.id) || 0;
            return (
              <div
                key={entry.id}
                className={`grid gap-0 border-t border-gray-100 items-center ${rank <= 3 ? "bg-amber-50/50" : ""}`}
                style={{ gridTemplateColumns: `1.5rem 1fr repeat(${DAYS.length}, 3.5rem) 3.5rem` }}
              >
                <div className="px-1 py-2 text-center">
                  <span className={`text-xs ${rank <= 3 && rank > 0 ? "font-bold text-gray-700" : "text-gray-400"}`}>{rank > 0 ? rank : "—"}</span>
                </div>
                <div className="px-2 py-2 flex items-center gap-1.5 min-w-0">
                  {entry.avatar_url ? (
                    <img src={entry.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" />
                  ) : (
                    <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center text-green-700 text-[8px] font-bold flex-shrink-0">
                      {(entry.display_name || "?")[0].toUpperCase()}
                    </span>
                  )}
                  <span className="text-xs font-medium text-gray-900 truncate">
                    {entry.display_name}
                  </span>
                </div>
                {DAYS.map((d) => {
                  const ds = entry.dayScores[d.day];
                  return (
                    <div key={d.day} className="px-1 py-2 text-center text-xs text-gray-600">
                      {ds ? formatDistance(ds.feet, ds.inches) : "—"}
                    </div>
                  );
                })}
                <div className="px-1 py-2 text-center text-xs font-bold text-gray-900">
                  {entry.grandTotal > 0 ? formatTotalInches(entry.grandTotal) : "—"}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmModal
        open={!!confirmModal}
        title={confirmModal?.title || ""}
        message={confirmModal?.message || ""}
        destructive
        onConfirm={() => {
          confirmModal?.onConfirm();
          setConfirmModal(null);
        }}
        onCancel={() => setConfirmModal(null)}
      />
    </div>
  );
}
