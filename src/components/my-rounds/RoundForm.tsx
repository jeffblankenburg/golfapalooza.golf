"use client";

import { useState, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import ScorecardEntry from "./ScorecardEntry";
import LiveScoringEntry from "./LiveScoringEntry";
import CourseLookupModal from "./CourseLookupModal";
import { calculateDifferential } from "@/lib/golf/calculator";
import { getTeeDotStyle } from "@/lib/utils/tee-colors";
import { formatCourseName } from "@/lib/utils/course-display";
import { BTN_BACK, BTN_PRIMARY } from "@/lib/ui/buttons";
import { readGeoCache, writeGeoCache, GEO_CACHE_TTL_MS } from "@/lib/geo-cache";

interface CourseSummary {
  id: string;
  name: string;
  club_name?: string | null;
  city: string | null;
  state: string | null;
  distance_mi?: number;
}

const NEARBY_RADIUS_MI = 25;

function formatDistance(mi: number): string {
  if (mi < 10) return `${(Math.round(mi * 10) / 10).toFixed(1)} mi`;
  return `${Math.round(mi)} mi`;
}

interface Tee {
  id: string;
  tee_name: string;
  tee_color: string | null;
  course_rating: number;
  slope_rating: number;
  par: number;
  total_yards: number | null;
  gender?: "men" | "women" | "all" | null;
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
  source_tee_color?: string | null;
  green_front_latitude?: number | null;
  green_front_longitude?: number | null;
  green_back_latitude?: number | null;
  green_back_longitude?: number | null;
  drive_latitude?: number | null;
  drive_longitude?: number | null;
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
  { key: "tees", label: "Tees" },
  { key: "scores", label: "Scores" },
] as const;

type StepKey = (typeof STEPS)[number]["key"];
// Internal sub-steps within "scores"
type Step = StepKey | "score-mode" | "total-entry" | "scorecard" | "live";

function getStepIndex(step: Step): number {
  if (step === "score-mode" || step === "total-entry" || step === "scorecard" || step === "live") {
    return STEPS.findIndex((s) => s.key === "scores");
  }
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
  const [roundType, setRoundType] = useState<"18" | "9-front" | "9-back">("18");
  const [roundDate, setRoundDate] = useState(new Date().toISOString().split("T")[0]);

  const [allLoozers, setAllLoozers] = useState<Loozer[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  // Refs used by the Players step to preserve scroll position when toggling
  // a player. The selected/unselected lists are siblings — removing a row
  // from the unselected list shrinks it and silently shifts scrollTop, so
  // we capture pre-toggle and restore post-render via useLayoutEffect.
  const unselectedListRef = useRef<HTMLDivElement>(null);
  const pendingScrollRef = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (pendingScrollRef.current == null) return;
    if (unselectedListRef.current) {
      unselectedListRef.current.scrollTop = pendingScrollRef.current;
    }
    pendingScrollRef.current = null;
  }, [selectedPlayerIds]);
  // Per-player tee overrides: playerId -> teeId (defaults to selectedTee)
  const [playerTees, setPlayerTees] = useState<Record<string, string>>({});
  const [teeTab, setTeeTab] = useState<"mens" | "womens">("mens");

  const hasWomensTees = tees.some((t) => t.gender === "women");
  const visibleTees = hasWomensTees
    ? tees.filter((t) => (teeTab === "mens" ? t.gender !== "women" : t.gender !== "men"))
    : tees;

  const [totalScores, setTotalScores] = useState<Record<string, string>>({});
  const [holes, setHoles] = useState<HoleData[]>([]);
  const [saving, setSaving] = useState(false);

  const [lookupOpen, setLookupOpen] = useState(false);

  // Nearby search state. `nearbyActive` means the visible list is
  // distance-sorted around the user's coords, not the alphabetic default.
  // We hide the "Near me" button when permission is explicitly denied so
  // we don't badger users; "prompt"/"granted"/unknown all show it.
  const [nearbyActive, setNearbyActive] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"unknown" | "granted" | "denied" | "prompt">("unknown");
  const [locating, setLocating] = useState(false);

  const allPlayerIds = selectedPlayerIds;
  const getPlayerName = (id: string) => allLoozers.find((l) => l.id === id)?.display_name || "Unknown";
  const getPlayerTee = (id: string) => {
    const tid = playerTees[id];
    return tid ? tees.find((t) => t.id === tid) ?? null : null;
  };
  const allPlayersHaveTees = allPlayerIds.length > 0 && allPlayerIds.every((id) => !!playerTees[id]);
  const currentStepIndex = getStepIndex(step);

  // Search courses (only when on course step). Skipped while nearbyActive
  // so the geo-sorted list isn't clobbered by a no-op text query.
  useEffect(() => {
    if (step !== "course") return;
    if (nearbyActive) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      const params = searchQuery ? `?q=${encodeURIComponent(searchQuery)}` : "";
      const res = await fetch(`/api/courses${params}`);
      const data = await res.json();
      setCourses(data.courses || []);
      setLoading(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, step, nearbyActive]);

  // Probe geolocation permission once so we can decide whether to render
  // the "Near me" button. Browsers without Permissions API (older Safari)
  // fall through to "prompt" — show the button, let the native dialog
  // handle the rest.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    if (!navigator.permissions?.query) {
      setGeoStatus("prompt");
      return;
    }
    let status: PermissionStatus | null = null;
    navigator.permissions
      .query({ name: "geolocation" as PermissionName })
      .then((s) => {
        status = s;
        setGeoStatus(s.state);
        s.onchange = () => setGeoStatus(s.state);
      })
      .catch(() => setGeoStatus("prompt"));
    return () => {
      if (status) status.onchange = null;
    };
  }, []);

  async function fetchNearby(lat: number, lng: number) {
    setNearbyActive(true);
    setSearchQuery("");
    setLoading(true);
    const res = await fetch(`/api/courses?lat=${lat}&lng=${lng}&radius=${NEARBY_RADIUS_MI}`);
    const data = await res.json();
    setCourses(data.courses || []);
    setLoading(false);
  }

  function findNearby() {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    const cached = readGeoCache();
    if (cached) {
      fetchNearby(cached.lat, cached.lng);
      return;
    }

    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        writeGeoCache(latitude, longitude);
        setGeoStatus("granted");
        setLocating(false);
        fetchNearby(latitude, longitude);
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) setGeoStatus("denied");
      },
      { enableHighAccuracy: false, maximumAge: GEO_CACHE_TTL_MS, timeout: 8000 }
    );
  }

  function exitNearby() {
    setNearbyActive(false);
  }

  useEffect(() => {
    async function fetchLoozers() {
      const res = await fetch("/api/users/list");
      const data = await res.json();
      setAllLoozers(data.users || []);
      if (data.current_user_id) {
        setCurrentUserId(data.current_user_id);
        setSelectedPlayerIds((prev) =>
          prev.length === 0 ? [data.current_user_id] : prev
        );
      }
    }
    fetchLoozers();
  }, []);

  async function selectCourse(course: CourseSummary) {
    setSelectedCourse(course);
    setSearchQuery("");
    setHoles([]);
    setPlayerTees({});
    const res = await fetch(`/api/courses/${course.id}/tees`);
    const data = await res.json();
    setTees(data.tees || []);
    setStep("details");
  }

  // Derive the "primary tee" used for scorecard hole loading, the score-mode
  // par display, and the live-scoring map. Prefer the current user's pick;
  // fall back to the first selected player's pick (e.g., when the user is
  // only scoring for others).
  const primaryPlayerId = currentUserId && allPlayerIds.includes(currentUserId)
    ? currentUserId
    : allPlayerIds[0] || null;
  const primaryTeeId = primaryPlayerId ? playerTees[primaryPlayerId] : null;
  const selectedTee = useMemo<Tee | null>(
    () => (primaryTeeId ? tees.find((t) => t.id === primaryTeeId) ?? null : null),
    [primaryTeeId, tees],
  );

  // Load hole data for the primary tee. Cleared via `selectCourse` when the
  // user picks a different course.
  useEffect(() => {
    if (!selectedCourse || !primaryTeeId) return;
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/courses/${selectedCourse.id}/tees/${primaryTeeId}/holes`);
      const data = await res.json();
      if (!cancelled) setHoles(data.holes || []);
    })();
    return () => { cancelled = true; };
  }, [selectedCourse, primaryTeeId]);

  function togglePlayer(id: string) {
    setSelectedPlayerIds((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
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
            <div className="font-semibold text-gray-900 leading-snug">{formatCourseName(selectedCourse)}</div>
            {(selectedCourse.city || selectedCourse.state) && (
              <div className="text-sm text-gray-500 leading-snug">
                {[selectedCourse.city, selectedCourse.state].filter(Boolean).join(", ")}
              </div>
            )}

            {selectedTee && (() => {
              // Show the current user's effective tee (may be an override)
              const effectiveTee = currentUserId ? getPlayerTee(currentUserId) : selectedTee;
              const displayTee = effectiveTee || selectedTee;
              return (
                <div className="text-sm text-gray-600 mt-2">
                  {displayTee.tee_name} tees
                  <span className="mx-2 text-gray-300">|</span>
                  {displayTee.course_rating} / {displayTee.slope_rating}
                  <span className="mx-2 text-gray-300">|</span>
                  Par {displayTee.par}
                </div>
              );
            })()}

            {currentStepIndex >= 2 && (
              <div className="text-sm text-gray-500 mt-1">
                {dateLabel}
                <span className="mx-2 text-gray-300">|</span>
                {typeLabel}
              </div>
            )}

            {currentStepIndex >= 3 && allPlayerIds.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {allPlayerIds.map((id) => {
                  const name = getPlayerName(id);
                  const pTee = getPlayerTee(id);
                  return (
                    <span key={id} className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full font-medium">
                      {name}{pTee ? ` (${pTee.tee_name})` : ""}
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
          <button onClick={onBack} className={`mt-3 ${BTN_BACK}`}>
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
              onChange={(e) => {
                setSearchQuery(e.target.value);
                if (nearbyActive) setNearbyActive(false);
              }}
              autoFocus
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent mb-2 text-sm"
              placeholder="Search by name, city, or state..."
            />

            {geoStatus !== "denied" && (
              <div className="mb-3 flex items-center justify-between">
                <button
                  onClick={nearbyActive ? exitNearby : findNearby}
                  disabled={locating}
                  aria-pressed={nearbyActive}
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full disabled:opacity-60 ${
                    nearbyActive
                      ? "text-green-800 bg-green-50 border border-green-300"
                      : "text-green-700 border border-green-200 hover:bg-green-50"
                  }`}
                >
                  <span aria-hidden>📍</span>
                  {locating
                    ? "Locating…"
                    : nearbyActive
                      ? `Within ${NEARBY_RADIUS_MI} mi`
                      : "Near me"}
                </button>
              </div>
            )}

            {loading ? (
              <div className="text-center py-4 text-sm text-gray-500">Searching...</div>
            ) : (
              <div className="space-y-1.5 max-h-80 overflow-y-auto">
                {/* In nearby mode the API already returns distance-sorted
                    results, so we render in order; otherwise sort by the
                    formatted name we display. */}
                {(nearbyActive
                  ? courses
                  : [...courses].sort((a, b) => formatCourseName(a).localeCompare(formatCourseName(b)))
                ).map((c) => (
                  <button
                    key={c.id}
                    onClick={() => selectCourse(c)}
                    className="w-full text-left rounded-lg px-3 py-2.5 hover:bg-green-50 transition-colors"
                  >
                    <div className="flex items-baseline justify-between gap-2">
                      <div className="text-sm font-medium text-gray-900 min-w-0">{formatCourseName(c)}</div>
                      {nearbyActive && c.distance_mi != null && (
                        <div className="text-xs text-gray-500 shrink-0 tabular-nums">{formatDistance(c.distance_mi)}</div>
                      )}
                    </div>
                    {(c.city || c.state) && (
                      <div className="text-xs text-gray-500">{[c.city, c.state].filter(Boolean).join(", ")}</div>
                    )}
                  </button>
                ))}
                {courses.length === 0 && (
                  <div className="text-center py-6">
                    {nearbyActive ? (
                      <>
                        <p className="text-sm text-gray-500 mb-3">No courses within {NEARBY_RADIUS_MI} miles.</p>
                        <button
                          onClick={exitNearby}
                          className={BTN_PRIMARY}
                        >
                          Search by name instead →
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="text-sm text-gray-500 mb-3">
                          {searchQuery
                            ? <>&lsquo;{searchQuery.trim()}&rsquo; hasn&apos;t been added yet.</>
                            : "No courses yet"}
                        </p>
                        <button
                          onClick={() => setLookupOpen(true)}
                          className="px-4 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg active:bg-green-700"
                        >
                          {searchQuery ? `Add ${searchQuery.trim()}` : "Add a new course"}
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {courses.length > 0 && (
              <div className="text-center pt-3 border-t border-gray-100 mt-3">
                <button
                  onClick={() => setLookupOpen(true)}
                  className={BTN_PRIMARY}
                >
                  Don&apos;t see your course? Add it →
                </button>
              </div>
            )}
          </div>
        </div>

        {lookupOpen && (
          <CourseLookupModal
            initialName={searchQuery}
            onClose={() => setLookupOpen(false)}
            onCourseReady={(c) => {
              setLookupOpen(false);
              selectCourse({
                id: c.id,
                name: c.name,
                club_name: c.club_name ?? null,
                city: c.city,
                state: c.state,
              });
            }}
            onManualFallback={(prefill) => {
              setLookupOpen(false);
              const params = new URLSearchParams();
              if (prefill.name) params.set("name", prefill.name);
              if (prefill.city) params.set("city", prefill.city);
              if (prefill.state) params.set("state", prefill.state);
              router.push(`/my-rounds/courses/new?${params.toString()}`);
            }}
          />
        )}
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
        (l.full_name && l.full_name.toLowerCase().includes(playerQuery)),
      );

    function handleToggle(id: string) {
      // Capture the unselected list's scroll position so we can restore it
      // after the toggle re-render. Without this, removing the tapped row
      // from the list (because it just moved to the "selected" section
      // above) silently shifts the scroll under the user's finger.
      if (unselectedListRef.current) {
        pendingScrollRef.current = unselectedListRef.current.scrollTop;
      }
      togglePlayer(id);
    }

    return (
      <StepCard
        title="Who Played?"
        subtitle="You're included by default — uncheck if you only scored. Live Scoring requires 4 or fewer."
        onBack={() => { setStep("details"); setSearchQuery(""); }}
      >
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          autoFocus
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-green-500 focus:border-transparent mb-3"
          placeholder="Search by name..."
        />

        {selectedLoozers.length > 0 && (
          <div className="space-y-1 mb-3">
            {selectedLoozers.map((l) => {
              const isMe = l.id === currentUserId;
              return (
                <button
                  key={l.id}
                  onClick={() => handleToggle(l.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg bg-green-50 border border-green-200 text-left"
                >
                  <span className="w-5 h-5 rounded-full bg-green-600 flex items-center justify-center shrink-0">
                    <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  </span>
                  <span className="text-sm font-medium text-gray-900">{l.display_name}{isMe ? " (You)" : ""}</span>
                </button>
              );
            })}
          </div>
        )}

        <div ref={unselectedListRef} className="space-y-1 max-h-[60vh] overflow-y-auto">
          {unselectedLoozers.map((l) => {
            const isMe = l.id === currentUserId;
            return (
              <button
                key={l.id}
                onClick={() => handleToggle(l.id)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-colors hover:bg-gray-50"
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
          onClick={() => { setStep("tees"); setSearchQuery(""); }}
          disabled={selectedPlayerIds.length === 0}
          className="w-full mt-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          Continue with {selectedPlayerIds.length || 0} Loozer{selectedPlayerIds.length !== 1 ? "s" : ""}
        </button>
      </StepCard>
    );
  }

  // ── Step: Tees ──
  if (step === "tees") {
    function setAllTees(teeId: string) {
      setPlayerTees((prev) => {
        const next = { ...prev };
        for (const id of allPlayerIds) next[id] = teeId;
        return next;
      });
    }

    return (
      <StepCard
        title="Pick Tees"
        subtitle="Every player needs a tee. Use a quick-set to assign everyone in one tap."
        onBack={() => setStep("players")}
      >
        {tees.length === 0 ? (
          <p className="text-sm text-gray-500 text-center py-6">
            No tees configured for this course.
          </p>
        ) : (
          <div className="space-y-3">
            {hasWomensTees && (
              <div className="flex gap-1 border-b border-gray-200">
                <button
                  onClick={() => setTeeTab("mens")}
                  className={`px-2.5 py-1 text-[11px] font-semibold border-b-2 -mb-px ${
                    teeTab === "mens" ? "border-green-600 text-green-700" : "border-transparent text-gray-500"
                  }`}
                >
                  Men&apos;s
                </button>
                <button
                  onClick={() => setTeeTab("womens")}
                  className={`px-2.5 py-1 text-[11px] font-semibold border-b-2 -mb-px ${
                    teeTab === "womens" ? "border-green-600 text-green-700" : "border-transparent text-gray-500"
                  }`}
                >
                  Women&apos;s
                </button>
              </div>
            )}

            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                All players
              </div>
              <div className="flex flex-wrap gap-1.5">
                {visibleTees.map((t) => {
                  const tDot = getTeeDotStyle(t.tee_color);
                  return (
                    <button
                      key={t.id}
                      onClick={() => setAllTees(t.id)}
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-700 hover:border-green-300"
                    >
                      <span className={`w-2.5 h-2.5 rounded-full inline-block ${tDot.className || ""}`} style={tDot.style} />
                      All {t.tee_name}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              {allPlayerIds.map((id) => {
                const name = getPlayerName(id);
                const isMe = id === currentUserId;
                const pTee = getPlayerTee(id);
                const pDot = getTeeDotStyle(pTee?.tee_color);
                const needsPick = !pTee;

                return (
                  <div
                    key={id}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border ${
                      needsPick ? "bg-amber-50 border-amber-200" : "bg-green-50 border-green-200"
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-gray-900">{name}{isMe ? " (You)" : ""}</span>
                    </div>
                    {pTee ? (
                      <span className={`w-3 h-3 rounded-full inline-block shrink-0 ${pDot.className || ""}`} style={pDot.style} />
                    ) : null}
                    <select
                      value={playerTees[id] || ""}
                      onChange={(e) => setPlayerTees((prev) => ({ ...prev, [id]: e.target.value }))}
                      className={`text-xs font-medium rounded-md px-2 py-1 border bg-white ${
                        needsPick ? "border-amber-300 text-amber-700" : "border-gray-200 text-gray-700"
                      }`}
                    >
                      {!pTee && <option value="">Choose tee</option>}
                      {visibleTees.map((t) => (
                        <option key={t.id} value={t.id}>{t.tee_name}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={() => setStep("score-mode")}
          disabled={!allPlayersHaveTees}
          className="w-full mt-4 py-3 bg-green-600 text-white font-semibold rounded-xl hover:bg-green-700 disabled:opacity-50 transition-colors"
        >
          {allPlayersHaveTees ? "Continue" : "Pick a tee for every player"}
        </button>
      </StepCard>
    );
  }

  // ── Step: Score mode ──
  if (step === "score-mode") {
    const liveDisabled = selectedPlayerIds.length > 4;
    return (
      <StepCard title="Enter Scores" subtitle="How do you want to enter scores?" onBack={() => setStep("tees")}>
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
            onClick={() => { if (!liveDisabled) setStep("live"); }}
            disabled={liveDisabled}
            className={`w-full text-left rounded-xl p-4 border transition-colors ${
              liveDisabled
                ? "border-gray-200 bg-gray-50 opacity-60 cursor-not-allowed"
                : "border-gray-200 hover:border-green-300 hover:bg-green-50"
            }`}
          >
            <div className="text-sm font-semibold text-gray-900">Live Scoring</div>
            <div className="text-xs text-gray-500 mt-0.5">
              {liveDisabled
                ? "Only available with 4 or fewer players."
                : "Score one hole at a time with +/- buttons. Best for scoring as you play."}
            </div>
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

        <button onClick={() => setStep("score-mode")} className={`mt-3 ${BTN_BACK}`}>← Back</button>
      </div>
    );
  }

  // ── Step: Live scoring ──
  if (step === "live") {
    const livePlayers = allPlayerIds.map((id) => ({
      id,
      name: getPlayerName(id),
      teeName: getPlayerTee(id)?.tee_name,
      teeColor: getPlayerTee(id)?.tee_color ?? null,
      teeId: playerTees[id] || selectedTee?.id,
    }));

    // Use the current user's tee override to determine which holes to show
    const effectiveTeeId = (currentUserId && playerTees[currentUserId]) || selectedTee?.id;

    return (
      <LiveScoringEntry
        holes={holes}
        players={livePlayers}
        roundType={roundType}
        courseName={selectedCourse ? formatCourseName(selectedCourse) : ""}
        courseId={selectedCourse?.id}
        teeId={selectedTee?.id}
        effectiveTeeId={effectiveTeeId}
        teeColor={getPlayerTee(currentUserId || "")?.tee_color || selectedTee?.tee_color}
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
