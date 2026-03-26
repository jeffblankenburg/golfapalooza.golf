"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CourseSearch } from "@/components/scoring/CourseSearch";
import { NearbyCourseSuggestion } from "@/components/scoring/NearbyCourseSuggestion";
import { TeeSelector } from "@/components/scoring/TeeSelector";
import { PlayerSetup, type PlayerConfig } from "@/components/scoring/PlayerSetup";
import type { Course, CourseTee, RoundType } from "@/types/golf";

type CourseSelectionMode = "detecting" | "search";

type WizardStep = "course" | "tee" | "type" | "date" | "players" | "confirm";

const STEPS: { key: WizardStep; title: string }[] = [
  { key: "course", title: "Select Course" },
  { key: "tee", title: "Your Tees" },
  { key: "type", title: "Round Type" },
  { key: "date", title: "Date" },
  { key: "players", title: "Add Players" },
  { key: "confirm", title: "Confirm" },
];

export default function NewRoundPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<WizardStep>("course");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Wizard state
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [selectedTee, setSelectedTee] = useState<CourseTee | null>(null);
  const [availableTees, setAvailableTees] = useState<CourseTee[]>([]);
  const [roundType, setRoundType] = useState<RoundType>("18");
  const [players, setPlayers] = useState<PlayerConfig[]>([]);
  const [roundDate, setRoundDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [courseSelectionMode, setCourseSelectionMode] = useState<CourseSelectionMode>("detecting");

  // Current user info (fetched from session)
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    display_name: string;
  } | null>(null);
  const [userFetchError, setUserFetchError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const response = await fetch("/api/me");
        const data = await response.json();
        if (response.ok && data.user) {
          setCurrentUser({
            id: data.user.id,
            display_name: data.user.display_name || "You",
          });
        } else {
          setUserFetchError(data.error || "Failed to load user profile");
        }
      } catch (err) {
        console.error("Failed to fetch current user:", err);
        setUserFetchError("Failed to connect to server");
      }
    }
    fetchCurrentUser();
  }, []);

  // Fetch tees when course changes
  useEffect(() => {
    async function fetchTees() {
      if (!selectedCourse) return;

      try {
        const response = await fetch(`/api/courses/${selectedCourse.id}`);
        const data = await response.json();
        if (response.ok && data.course?.tees) {
          setAvailableTees(data.course.tees);
        }
      } catch (err) {
        console.error("Failed to fetch tees:", err);
      }
    }

    fetchTees();
  }, [selectedCourse]);

  const currentStepIndex = STEPS.findIndex((s) => s.key === currentStep);

  const canProceed = () => {
    switch (currentStep) {
      case "course":
        return !!selectedCourse;
      case "tee":
        return !!selectedTee;
      case "type":
        return !!roundType;
      case "date":
        return !!roundDate;
      case "players":
        return players.length >= 1;
      case "confirm":
        return true;
      default:
        return false;
    }
  };

  const goNext = () => {
    if (currentStepIndex < STEPS.length - 1) {
      setCurrentStep(STEPS[currentStepIndex + 1].key);
    }
  };

  const goBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStep(STEPS[currentStepIndex - 1].key);
    }
  };

  const goToStep = (stepKey: WizardStep) => {
    const targetIndex = STEPS.findIndex((s) => s.key === stepKey);
    // Only allow navigating to completed steps or the current step
    if (targetIndex <= currentStepIndex) {
      setCurrentStep(stepKey);
      // When going back to course, show search (user already saw detection)
      if (stepKey === "course") {
        setCourseSelectionMode("search");
      }
    }
  };

  // Auto-advance when course is selected
  const handleCourseSelect = (course: Course | null) => {
    setSelectedCourse(course);
    if (course) {
      // Clear tee selection when course changes
      setSelectedTee(null);
      setCurrentStep("tee");
    }
  };

  // Auto-advance when tee is selected
  const handleTeeSelect = (tee: CourseTee) => {
    setSelectedTee(tee);
    setCurrentStep("type");
  };

  // Auto-advance when round type is selected
  const handleRoundTypeSelect = (type: RoundType) => {
    setRoundType(type);
    setCurrentStep("date");
  };

  const handlePlayersChange = useCallback((newPlayers: PlayerConfig[]) => {
    setPlayers(newPlayers);
  }, []);

  const handleSubmit = async () => {
    if (!selectedCourse || !selectedTee) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/rounds", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          course_id: selectedCourse.id,
          tee_id: selectedTee.id,
          round_type: roundType,
          round_date: roundDate,
          players: players.map((p) => ({
            user_id: p.user_id,
            tee_id: p.tee_id,
            is_scorer: p.is_scorer,
          })),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to create round");
      }

      // Navigate to the scoring page for this round
      router.push(`/scoring/${data.round.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create round");
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push("/scoring")}
              className="text-gray-500 hover:text-gray-700"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <h1 className="text-xl font-semibold text-gray-900">New Round</h1>
          </div>

          {/* Progress */}
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map((step, index) => {
              const isCompleted = index < currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const isClickable = index <= currentStepIndex;

              return (
                <div key={step.key} className="flex items-center flex-1">
                  <button
                    type="button"
                    onClick={() => isClickable && goToStep(step.key)}
                    disabled={!isClickable}
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-all ${
                      isCompleted || isCurrent
                        ? "bg-green-600 text-white"
                        : "bg-gray-200 text-gray-500"
                    } ${
                      isClickable && !isCurrent
                        ? "hover:ring-2 hover:ring-green-300 hover:ring-offset-2 cursor-pointer"
                        : isCurrent
                        ? "ring-2 ring-green-300 ring-offset-2"
                        : "cursor-not-allowed"
                    }`}
                  >
                    {isCompleted ? (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      index + 1
                    )}
                  </button>
                  {index < STEPS.length - 1 && (
                    <div
                      className={`flex-1 h-1 mx-2 ${
                        isCompleted ? "bg-green-600" : "bg-gray-200"
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
          <p className="text-sm text-gray-500 mt-2 text-center">
            {STEPS[currentStepIndex].title}
          </p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl mx-auto px-4 py-6">
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
            {error}
          </div>
        )}

        {currentStep === "course" && (
          <div className="space-y-6">
            {courseSelectionMode === "detecting" ? (
              <NearbyCourseSuggestion
                onCourseSelect={handleCourseSelect}
                onSearchInstead={() => setCourseSelectionMode("search")}
              />
            ) : (
              <CourseSearch
                onSelect={handleCourseSelect}
                selectedCourse={selectedCourse}
                onLocationEnabled={() => setCourseSelectionMode("detecting")}
              />
            )}
          </div>
        )}

        {currentStep === "tee" && selectedCourse && (
          <div className="space-y-4">
            {/* Context: Selected Course */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Course</div>
                <div className="font-medium text-gray-900">{selectedCourse.name}</div>
              </div>
              <button
                type="button"
                onClick={() => goToStep("course")}
                className="text-sm text-green-600 hover:text-green-700 font-medium"
              >
                Change
              </button>
            </div>
            <TeeSelector
              courseId={selectedCourse.id}
              onSelect={handleTeeSelect}
              selectedTee={selectedTee}
            />
          </div>
        )}

        {currentStep === "type" && selectedCourse && selectedTee && (
          <div className="space-y-4">
            {/* Context: Selected Course & Tee */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Course</div>
                  <div className="font-medium text-gray-900">{selectedCourse.name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => goToStep("course")}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Change
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 flex items-center justify-between">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tees</div>
                  <div className="font-medium text-gray-900">{selectedTee.tee_name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => goToStep("tee")}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Change
                </button>
              </div>
            </div>

            {/* Round Type Selection - Stat Boxes Style */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                Select Round Type
              </label>
              <div className="grid gap-3">
                {[
                  { value: "18" as RoundType, label: "18 Holes", holes: "1-18" },
                  { value: "9-front" as RoundType, label: "Front 9", holes: "1-9" },
                  { value: "9-back" as RoundType, label: "Back 9", holes: "10-18" },
                ].map((type) => {
                  const isSelected = roundType === type.value;
                  return (
                    <button
                      key={type.value}
                      type="button"
                      onClick={() => handleRoundTypeSelect(type.value)}
                      className={`text-left p-4 rounded-lg border-2 transition-colors ${
                        isSelected
                          ? "border-green-500 bg-green-50"
                          : "border-gray-200 hover:border-green-300 bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900 flex-1">{type.label}</span>
                        {isSelected && (
                          <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                          </svg>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 mt-3">
                        <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Holes</div>
                          <div className="text-sm font-semibold text-gray-900">{type.holes}</div>
                        </div>
                        <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                          <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Par</div>
                          <div className="text-sm font-semibold text-gray-900">{type.value === "18" ? selectedTee.par : Math.round(selectedTee.par / 2)}</div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {currentStep === "date" && selectedCourse && selectedTee && (
          <div className="space-y-4">
            {/* Context: Selected Course, Tee & Round Type */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Course</div>
                  <div className="font-medium text-gray-900">{selectedCourse.name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => goToStep("course")}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Change
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tees</div>
                  <div className="font-medium text-gray-900">{selectedTee.tee_name}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Round</div>
                  <div className="font-medium text-gray-900">
                    {roundType === "18" ? "18 Holes" : roundType === "9-front" ? "Front 9" : "Back 9"}
                  </div>
                </div>
              </div>
            </div>

            {/* Date Selection */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-gray-700">
                When are you playing?
              </label>
              <div className="grid gap-3">
                {/* Today option */}
                <button
                  type="button"
                  onClick={() => setRoundDate(new Date().toISOString().split("T")[0])}
                  className={`text-left p-4 rounded-lg border-2 transition-colors ${
                    roundDate === new Date().toISOString().split("T")[0]
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-green-300 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900 flex-1">Today</span>
                    {roundDate === new Date().toISOString().split("T")[0] && (
                      <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 mt-3">
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center">
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Date</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      </div>
                    </div>
                  </div>
                </button>

                {/* Other date option */}
                <div
                  className={`text-left p-4 rounded-lg border-2 transition-colors cursor-pointer ${
                    roundDate !== new Date().toISOString().split("T")[0]
                      ? "border-green-500 bg-green-50"
                      : "border-gray-200 hover:border-green-300 bg-white"
                  }`}
                  onClick={() => {
                    const input = document.getElementById("date-picker") as HTMLInputElement;
                    if (input) input.showPicker();
                  }}
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900 flex-1">Different Day</span>
                    {roundDate !== new Date().toISOString().split("T")[0] && (
                      <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <div className="grid grid-cols-1 gap-2 mt-3">
                    <div className="bg-gray-50 rounded-lg px-2 py-1.5 text-center relative">
                      <div className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Date</div>
                      <div className="text-sm font-semibold text-gray-900">
                        {roundDate !== new Date().toISOString().split("T")[0]
                          ? new Date(roundDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })
                          : "Tap to select"}
                      </div>
                      <input
                        id="date-picker"
                        type="date"
                        value={roundDate}
                        onChange={(e) => setRoundDate(e.target.value)}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {currentStep === "players" && selectedCourse && selectedTee && (
          <div className="space-y-4">
            {/* Context: Selected Course, Tee, Round Type & Date */}
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Course</div>
                  <div className="font-medium text-gray-900">{selectedCourse.name}</div>
                </div>
                <button
                  type="button"
                  onClick={() => goToStep("course")}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  Change
                </button>
              </div>
              <div className="mt-2 pt-2 border-t border-gray-200 grid grid-cols-3 gap-4">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Tees</div>
                  <div className="font-medium text-gray-900">{selectedTee.tee_name}</div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Round</div>
                  <div className="font-medium text-gray-900">
                    {roundType === "18" ? "18 Holes" : roundType === "9-front" ? "Front 9" : "Back 9"}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Date</div>
                  <div className="font-medium text-gray-900">
                    {roundDate === new Date().toISOString().split("T")[0]
                      ? "Today"
                      : new Date(roundDate + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </div>
                </div>
              </div>
            </div>

            {currentUser ? (
              <PlayerSetup
                defaultTee={selectedTee}
                availableTees={availableTees}
                currentUserId={currentUser.id}
                currentUserName={currentUser.display_name}
                players={players}
                onPlayersChange={handlePlayersChange}
              />
            ) : userFetchError ? (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-red-700 text-sm">{userFetchError}</p>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="mt-2 text-sm text-red-600 hover:text-red-800 font-medium"
                >
                  Retry
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
              </div>
            )}
          </div>
        )}

        {currentStep === "confirm" && (
          <div className="space-y-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Review Your Round
            </h2>

            <div className="bg-white border border-gray-200 rounded-lg divide-y">
              <div className="p-4">
                <div className="text-sm text-gray-500">Course</div>
                <div className="font-medium text-gray-900">
                  {selectedCourse?.name}
                </div>
                <div className="text-sm text-gray-500">
                  {selectedCourse?.city}, {selectedCourse?.state}
                </div>
              </div>

              <div className="p-4">
                <div className="text-sm text-gray-500">Tees</div>
                <div className="font-medium text-gray-900">
                  {selectedTee?.tee_name}
                </div>
                <div className="text-sm text-gray-500">
                  Rating: {selectedTee?.course_rating} / Slope:{" "}
                  {selectedTee?.slope_rating}
                </div>
              </div>

              <div className="p-4">
                <div className="text-sm text-gray-500">Round</div>
                <div className="font-medium text-gray-900">
                  {roundType === "18"
                    ? "Full 18 Holes"
                    : roundType === "9-front"
                    ? "Front 9 (Holes 1-9)"
                    : "Back 9 (Holes 10-18)"}
                </div>
                <div className="text-sm text-gray-500">{roundDate}</div>
              </div>

              <div className="p-4">
                <div className="text-sm text-gray-500 mb-2">
                  Players ({players.length})
                </div>
                <div className="space-y-2">
                  {players.map((player, index) => {
                    const playerTee = availableTees.find(
                      (t) => t.id === player.tee_id
                    );
                    return (
                      <div
                        key={player.user_id}
                        className="flex items-center justify-between"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 bg-green-100 text-green-700 rounded-full flex items-center justify-center text-xs font-medium">
                            {index + 1}
                          </span>
                          <span className="font-medium text-gray-900">
                            {player.display_name}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500">
                          {playerTee?.tee_name || "Default"}
                          {player.is_scorer && " (Scorer)"}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions - positioned above BottomNav (h-16 = 64px) */}
      {/* Hide footer on course/tee/type steps since they auto-advance */}
      {(currentStep === "date" || currentStep === "players" || currentStep === "confirm") && (
        <div className="fixed bottom-16 left-0 right-0 bg-white border-t border-gray-200 p-4 z-30">
          <div className="max-w-2xl mx-auto flex gap-3">
            <button
              type="button"
              onClick={goBack}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
            {currentStep !== "confirm" ? (
              <button
                type="button"
                onClick={goNext}
                disabled={!canProceed()}
                className={`flex-1 py-3 px-4 rounded-lg font-medium text-white ${
                  canProceed()
                    ? "bg-green-600 hover:bg-green-700"
                    : "bg-gray-300 cursor-not-allowed"
                }`}
              >
                Continue
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="flex-1 py-3 px-4 bg-green-600 hover:bg-green-700 rounded-lg font-medium text-white disabled:bg-gray-300"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <div className="animate-spin h-5 w-5 border-2 border-white border-t-transparent rounded-full" />
                    Starting Round...
                  </span>
                ) : (
                  "Start Round"
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom padding for fixed footer + BottomNav */}
      <div className="h-40" />
    </div>
  );
}
