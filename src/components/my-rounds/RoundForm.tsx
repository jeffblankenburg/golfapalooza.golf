"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ScorecardEntry from "./ScorecardEntry";
import LiveScoringEntry from "./LiveScoringEntry";
import { calculateDifferential } from "@/lib/golf/calculator";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";

interface CourseSummary {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
}

interface Tee {
  id: string;
  tee_name: string;
  tee_color: string | null;
  course_rating: number;
  slope_rating: number;
  par: number;
  total_yards: number | null;
}

interface HoleData {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
  tee_latitude?: number | null;
  tee_longitude?: number | null;
  green_latitude?: number | null;
  green_longitude?: number | null;
  overhead_image_url?: string | null;
  green_image_url?: string | null;
}

interface Loozer {
  id: string;
  display_name: string;
  full_name: string | null;
}


const STEPS = [
  { key: "course", label: "Course" },
  { key: "details", label: "Details" },
  { key: "players", label: "Players" },
  { key: "scores", label: "Scores" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
// Internal sub-steps within "scores"
type Step = StepKey | "score-mode" | "total-entry" | "scorecard" | "live";

function getStepIndex(step: Step): number {
  if (step === "score-mode" || step === "total-entry" || step === "scorecard" || step === "live") return 3;
  return STEPS.findIndex((s) => s.key === step);
}

export default function RoundForm() {
  const router = useRouter();

  const [step, setStep] = useState<Step>("course");
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);

  const [selectedCourse, setSelectedCourse] = useState<CourseSummary | null>(null);
  const [tees, setTees] = useState<Tee[]>([]);
  const [selectedTee, setSelectedTee] = useState<Tee | null>(null);
  const [roundType, setRoundType] = useState<"18" | "9-front" | "9-back">("18");
  const [roundDate, setRoundDate] = useState(new Date().toISOString().split("T")[0]);

  const [allLoozers, setAllLoozers] = useState<Loozer[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  // Per-player tee overrides: playerId -> teeId (defaults to selectedTee)
  const [playerTees, setPlayerTees] = useState<Record<string, string>>({});
  const [editingPlayerTee, setEditingPlayerTee] = useState<string | null>(null);

  const [totalScores, setTotalScores] = useState<Record<string, string>>({});
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);

  const allPlayerIds = selectedPlayerIds;
  const getPlayerName = (id: string) => allLoozers.find((l) => l.id === id)?.display_name || "Unknown";
  const getPlayerTee = (id: string) => tees.find((t) => t.id === (playerTees[id] || selectedTee?.id)) || selectedTee;
  const currentStepIndex = getStepIndex(step);

  // Search courses (only when on course step)
  useEffect(() => {
    if (step !== "course") return;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(`/api/courses${params}`);
      const data = await res.json();
      setCourses(data.courses || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, step]);

  useEffect(() => {
    async function fetchLoozers() {
      const res = await fetch("/api/users/list");
      const data = await res.json();
      setAllLoozers(data.users || []);
      if (data.current_user_id) setCurrentUserId(data.current_user_id);
    }
    fetchLoozers();
  }, []);

  async function selectCourse(course: CourseSummary) {
    setSelectedCourse(course);
    setSearchQuery("");
    const res = await fetch(`/api/courses/${course.id}/tees`);
    const data = await res.json();
    const courseTees = data.tees || [];
    setTees(courseTees);

    // Default to first tee and load its holes
    if (courseTees.length > 0) {
      const defaultTee = courseTees[0];
      setSelectedTee(defaultTee);
      const holesRes = await fetch(`/api/courses/${course.id}/tees/${defaultTee.id}/holes`);
      const holesData = await holesRes.json();
      setHoles(holesData.holes || []);
    }

    setStep("details");
  }

  // Reload holes when the default tee changes (e.g., from player tee picker)
  async function changeDefaultTee(tee: Tee) {
    if (!selectedCourse) return;
    setSelectedTee(tee);
    const res = await fetch(`/api/courses/${selectedCourse.id}/tees/${tee.id}/holes`);
    const data = await res.json();
    setHoles(data.holes || []);
  }

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  }

  async function handleQuickEntry() {
    if (!selectedCourse || !selectedTee) return;
    const players = allPlayerIds.map((id) => ({
      user_id: id,
      tee_id: playerTees[id] || selectedTee.id,
      final_gross_score: totalScores[id] ? parseInt(totalScores[id]) : undefined,
    }));
    if (players.some((p) => !p.final_gross_score)) return;

    setSaving(true);
    const res = await fetch("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_id: selectedCourse.id,
        tee_id: selectedTee.id,
        round_type: roundType,
        round_date: roundDate,
        players,
      }),
    });

    if (res.ok) {
      router.push("/my-rounds");
      router.refresh();
    }
    setSaving(false);
  }

  async function handleScorecardComplete(cardScores: Record<string, Record<number, number>>) {
    if (!selectedCourse || !selectedTee) return;
    setSaving(true);

    const res = await fetch("/api/rounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        course_id: selectedCourse.id,
        tee_id: selectedTee.id,
        round_type: roundType,
        round_date: roundDate,
        players: allPlayerIds.map((id) => ({ user_id: id, tee_id: playerTees[id] || selectedTee.id })),
        hole_scores: cardScores,
      }),
    });

    if (!res.ok) {
      console.error(`POST /api/rounds failed: ${res.status}`);
      setSaving(false);
      return;
    }

    const { round } = await res.json();
    router.push(`/my-rounds/rounds/${round.id}`);
    router.refresh();
    setSaving(false);
  }

  // ── Stepper header ──
  function StepIndicator() {
    return (
      <div className="flex items-center gap-1 mb-6">
        {STEPS.map((s, i) => {
          const isComplete = i < currentStepIndex;
          const isCurrent = i === currentStepIndex;
          const canTap = isComplete;

          function handleTap() {
            if (!canTap) return;
            setSearchQuery("");
            setStep(s.key as Step);
          }

          return (
            <div key={s.key} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <button
                  type="button"
                  onClick={handleTap}
                  disabled={!canTap}
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                    isComplete
                      ? "bg-green-600 text-white cursor-pointer hover:bg-green-700"
                      : isCurrent
                        ? "bg-green-600 text-white ring-4 ring-green-100 cursor-default"
                        : "bg-gray-200 text-gray-500 cursor-default"
                  }`}
                >
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </button>
                <div className={`text-[10px] mt-1 font-medium ${
                  canTap ? "text-green-600 cursor-pointer" : isCurrent ? "text-green-700" : "text-gray-400"
                }`}
                  onClick={handleTap}
                >
                  {s.label}
                </div>
              </div>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 flex-1 -mt-4 mx-0.5 ${
                  i < currentStepIndex ? "bg-green-400" : "bg-gray-200"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  function SelectionSummary() {
    if (!selectedCourse) return null;

    const typeLabel = roundType === "18" ? "18 Holes" : roundType === "9-front" ? "Front 9" : "Back 9";
    const [y, m, d] = roundDate.split("-").map(Number);
    const dateObj = new Date(y, m - 1, d);
    const dateLabel = dateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    const teeColor = selectedTee?.tee_color;
    const dot = getTeeDotStyle(teeColor);

    return (
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
        <div className="flex items-start gap-3">
          <div className={`w-8 h-8 rounded-full shrink-0 mt-0.5 ${dot.className || ""}`} style={dot.style} />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-gray-900 leading-snug">{selectedCourse.name}</div>
            {(selectedCourse.city || selectedCourse.state) && (
              <div className="text-sm text-gray-500 leading-snug">
                {[selectedCourse.city, selectedCourse.state].filter(Boolean).join(", ")}
              </div>
            )}

            {selectedTee && (
              <div className="text-sm text-gray-600 mt-2">
                {selectedTee.tee_name} tees
                <span className="mx-2 text-gray-300">|</span>
                {selectedTee.course_rating} / {selectedTee.slope_rating}
                <span className="mx-2 text-gray-300">|</span>
                Par {selectedTee.par}
              </div>
            )}

            {currentStepIndex >= 3 && (
              <div className="text-sm text-gray-500 mt-1">
                {dateLabel}
                <span className="mx-2 text-gray-300">|</span>
                {typeLabel}
              </div>
            )}

            {currentStepIndex >= 4 && allPlayerIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allPlayerIds.map((id) => {
                  const name = getPlayerName(id);
                  const pTee = getPlayerTee(id);
                  const hasDifferentTee = playerTees[id] && playerTees[id] !== selectedTee?.id;
                  return (
                    <span key={id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                      {name}{hasDifferentTee ? ` (${pTee?.tee_name})` : ""}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Shared card wrapper ──
  function StepCard({ title, subtitle, children, onBack, backLabel }: {
    title: string;
    subtitle?: string;
    children: React.ReactNode;
    onBack?: () => void;
    backLabel?: string;
  }) {
    return (
      <div>
        <StepIndicator />
        <SelectionSummary />
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>}
          </div>
          <div className="p-4">
            {children}
          </div>
        </div>
        {onBack && (
          <button onClick={onBack} className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600">
            {backLabel || "← Back"}
          </button>
        )}
      </div>
    );
  }

  // ── Step: Course ──
  if (step === "course") {
    return (
      <div>
        <StepIndicator />
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
            <h2 className="text-sm font-semibold text-gray-900">Select a Course</h2>
            <p className="text-xs text-gray-500 mt-0.5">Where did you play?</p>
          </div>
          <div className="p-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3 text-sm"
              placeholder="Search by name, city, or state..."
            />

            {loading ? (
              <div className="text-center py-4 text-sm text-gray-500">Searching...</div>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {courses.map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCourse(c)}
                    className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-green-50 transition-colors"
                  >
                    <div className="text-sm font-medium text-gray-900">{c.name}</div>
                    {(c.city || c.state) && (
                      <div className="text-xs text-gray-500">{[c.city, c.state].filter(Boolean).join(", ")}</div>
                    )}
                  </button>
                ))}
                {courses.length === 0 && (
                  <div className="text-center py-6">
                    <p className="text-sm text-gray-500 mb-2">{searchQuery ? "No courses found" : "No courses yet"}</p>
                    <Link href="/my-rounds/courses/new" className="text-sm text-green-700 font-medium">+ Add a New Course</Link>
                  </div>
                )}
              </div>
            )}

            <div className="text-center pt-3 border-t border-gray-100 mt-3">
              <Link href="/my-rounds/courses/new" className="text-xs text-green-700 font-medium">
                Don&apos;t see your course? Add it →
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Step: Details ──
  if (step === "details") {
    return (
      <StepCard title="Round Details" subtitle="When and what type?" onBack={() => setStep("course")}>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
            <input
              type="date"
              value={roundDate}
              onChange={(e) => setRoundDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Round Type</label>
            <div className="flex gap-2">
              {([
                { value: "18", label: "18 Holes" },
                { value: "9-front", label: "Front 9" },
                { value: "9-back", label: "Back 9" },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setRoundType(opt.value)}
                  className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    roundType === opt.value
                      ? "bg-green-600 text-white"
                      : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={() => setStep("players")}
            className="w-full py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 transition-colors"
          >
            Continue
          </button>
        </div>
      </StepCard>
    );
  }

  // ── Step: Players ──
  if (step === "players") {
    const playerQuery = searchQuery.toLowerCase();
    const selectedLoozers = allLoozers.filter((l) => selectedPlayerIds.includes(l.id));
    const unselectedLoozers = allLoozers
      .filter((l) => !selectedPlayerIds.includes(l.id))
      .filter((l) =>
        !playerQuery ||
        l.display_name.toLowerCase().includes(playerQuery) ||
        (l.full_name && l.full_name.toLowerCase().includes(playerQuery))
      );

    return (
      <StepCard title="Who Played?" subtitle="Select up to 4 Loozers. Include yourself if you played." onBack={() => { setStep("details"); setSearchQuery(""); }}>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
          placeholder="Search by name..."
        />

        {selectedLoozers.length > 0 && (
          <div className="space-y-1.5 mb-3">
            {selectedLoozers.map((l) => {
              const isMe = l.id === currentUserId;
              const pTee = getPlayerTee(l.id);
              const isEditingTee = editingPlayerTee === l.id;
              const pDot = getTeeDotStyle(pTee?.tee_color);

              return (
                <div key={l.id} className="bg-green-50 border border-green-200 rounded-lg overflow-hidden">
                  <div className="flex items-center gap-2.5 px-3 py-2">
                    <button
                      onClick={() => togglePlayer(l.id)}
                      className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center shrink-0"
                    >
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </button>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{l.display_name}{isMe ? " (You)" : ""}</span>
                    </div>
                    <button
                      onClick={() => setEditingPlayerTee(isEditingTee ? null : l.id)}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-gray-600 hover:bg-green-100 transition-colors"
                    >
                      <span className={`w-3 h-3 rounded-full inline-block shrink-0 ${pDot.className || ""}`} style={pDot.style} />
                      <span>{pTee?.tee_name || "—"}</span>
                      <svg className={`w-3 h-3 text-gray-400 transition-transform ${isEditingTee ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                  </div>
                  {isEditingTee && (
                    <div className="px-3 pb-2 flex flex-wrap gap-1.5">
                      {tees.map((t) => {
                        const isActive = (playerTees[l.id] || selectedTee?.id) === t.id;
                        const tDot = getTeeDotStyle(t.tee_color);
                        return (
                          <button
                            key={t.id}
                            onClick={() => {
                              setPlayerTees((prev) => ({ ...prev, [l.id]: t.id }));
                              setEditingPlayerTee(null);
                            }}
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                              isActive
                                ? "bg-green-600 text-white"
                                : "bg-white border border-gray-200 text-gray-700 hover:border-green-300"
                            }`}
                          >
                            {!isActive && <span className={`w-2.5 h-2.5 rounded-full inline-block ${tDot.className || ""}`} style={tDot.style} />}
                            {t.tee_name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="space-y-1 max-h-52 overflow-y-auto">
          {unselectedLoozers.map((l) => {
            const isMe = l.id === currentUserId;
            const atMax = selectedPlayerIds.length >= 4;
            return (
              <button
                key={l.id}
                onClick={() => !atMax && togglePlayer(l.id)}
                disabled={atMax}
                className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors ${
                  atMax ? "opacity-40" : "hover:bg-gray-50"
                }`}
              >
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 shrink-0" />
                <span className="text-sm text-gray-700">{l.display_name}{isMe ? " (You)" : ""}</span>
              </button>
            );
          })}
          {unselectedLoozers.length === 0 && playerQuery && (
            <div className="text-center py-3 text-xs text-gray-500">No matches</div>
          )}
        </div>

        <button
          onClick={() => { setStep("score-mode"); setSearchQuery(""); }}
          disabled={selectedPlayerIds.length === 0}
          className="w-full mt-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Continue with {selectedPlayerIds.length || 0} Loozer{selectedPlayerIds.length !== 1 ? "s" : ""}
        </button>
      </StepCard>
    );
  }

  // ── Step: Score mode ──
  if (step === "score-mode") {
    return (
      <StepCard title="Enter Scores" subtitle="How do you want to enter scores?" onBack={() => setStep("players")}>
        <div className="space-y-2">
          <button
            onClick={() => setStep("total-entry")}
            className="w-full text-left rounded-xl p-4 border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">Quick Entry</div>
            <div className="text-xs text-gray-500 mt-0.5">Just enter final scores. Fast and simple.</div>
          </button>

          <button
            onClick={() => setStep("scorecard")}
            className="w-full text-left rounded-xl p-4 border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">Full Scorecard</div>
            <div className="text-xs text-gray-500 mt-0.5">Enter every hole. Best for entering a past round.</div>
          </button>

          <button
            onClick={() => setStep("live")}
            className="w-full text-left rounded-xl p-4 border border-gray-200 hover:border-green-300 hover:bg-green-50 transition-colors"
          >
            <div className="text-sm font-semibold text-gray-900">Live Scoring</div>
            <div className="text-xs text-gray-500 mt-0.5">Score one hole at a time with +/- buttons. Best for scoring as you play.</div>
          </button>
        </div>
      </StepCard>
    );
  }

  // ── Step: Total entry ──
  if (step === "total-entry") {
    const par = selectedTee?.par || 72;
    const allFilled = allPlayerIds.every((id) => totalScores[id] && parseInt(totalScores[id]) > 0);

    return (
      <StepCard title="Total Scores" subtitle={`Par ${par}`} onBack={() => setStep("score-mode")}>
        <div className="space-y-3">
          {allPlayerIds.map((id, i) => {
            const name = getPlayerName(id);
            const isMe = id === currentUserId;
            const scoreStr = totalScores[id] || "";
            const scoreNum = scoreStr ? parseInt(scoreStr) : null;
            const diff =
              scoreNum != null && selectedTee
                ? calculateDifferential(scoreNum, selectedTee.course_rating, selectedTee.slope_rating)
                : null;

            return (
              <div key={id}>
                <label className="block text-xs font-medium text-gray-500 mb-1">
                  {name}{isMe ? " (You)" : ""}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    inputMode="numeric"
                    value={scoreStr}
                    onChange={(e) => setTotalScores((prev) => ({ ...prev, [id]: e.target.value }))}
                    autoFocus={i === 0}
                    className="flex-1 px-4 py-2.5 text-xl text-center border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder={String(par)}
                  />
                  {scoreNum != null && (
                    <div className="text-right shrink-0 w-20">
                      <div className={`text-sm font-bold ${
                        scoreNum - par > 0 ? "text-red-600" : scoreNum - par < 0 ? "text-green-600" : "text-gray-700"
                      }`}>
                        {scoreNum - par > 0 ? "+" : ""}{scoreNum - par}
                      </div>
                      {diff != null && (
                        <div className="text-[10px] text-gray-400">Diff {diff.toFixed(1)}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <button
          onClick={handleQuickEntry}
          disabled={!allFilled || saving}
          className="w-full mt-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {saving ? "Saving..." : "Save Round"}
        </button>
      </StepCard>
    );
  }

  // ── Step: Scorecard ──
  if (step === "scorecard") {
    const scorecardPlayers = allPlayerIds.map((id) => ({
      id,
      name: getPlayerName(id),
    }));

    return (
      <div>
        <StepIndicator />
        <SelectionSummary />

        <ScorecardEntry
          holes={holes}
          players={scorecardPlayers}
          tee={{
            course_rating: selectedTee!.course_rating,
            slope_rating: selectedTee!.slope_rating,
            par: selectedTee!.par,
          }}
          roundType={roundType}
          onComplete={handleScorecardComplete}
          saving={saving}
        />

        <button onClick={() => setStep("score-mode")} className="mt-3 w-full text-sm text-gray-400 hover:text-gray-600">← Back</button>
      </div>
    );
  }

  // ── Step: Live scoring ──
  if (step === "live") {
    const livePlayers = allPlayerIds.map((id) => ({
      id,
      name: getPlayerName(id),
      teeName: getPlayerTee(id)?.tee_name,
    }));

    return (
      <LiveScoringEntry
        holes={holes}
        players={livePlayers}
        roundType={roundType}
        courseName={selectedCourse?.name || ""}
        courseId={selectedCourse?.id}
        teeId={selectedTee?.id}
        roundDate={roundDate}
        onClose={() => {
          router.push("/my-rounds");
          router.refresh();
        }}
      />
    );
  }

  return null;
}
