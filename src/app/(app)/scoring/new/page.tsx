"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { CourseSearch } from "@/components/scoring/CourseSearch";
import { TeeSelector } from "@/components/scoring/TeeSelector";
import { RoundTypeSelector } from "@/components/scoring/RoundTypeSelector";
import { PlayerSetup, type PlayerConfig } from "@/components/scoring/PlayerSetup";
import type { Course, CourseTee, RoundType } from "@/types/golf";

type WizardStep = "course" | "tee" | "type" | "players" | "confirm";

const STEPS: { key: WizardStep; title: string }[] = [
  { key: "course", title: "Select Course" },
  { key: "tee", title: "Choose Tees" },
  { key: "type", title: "Round Type" },
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

  // Current user info (fetched from session)
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    display_name: string;
  } | null>(null);

  useEffect(() => {
    async function fetchCurrentUser() {
      try {
        const response = await fetch("/api/admin/users");
        const data = await response.json();
        if (data.current_user) {
          setCurrentUser({
            id: data.current_user.id,
            display_name: data.current_user.display_name || "You",
          });
        }
      } catch (err) {
        console.error("Failed to fetch current user:", err);
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
            {STEPS.map((step, index) => (
              <div key={step.key} className="flex items-center flex-1">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                    index < currentStepIndex
                      ? "bg-green-600 text-white"
                      : index === currentStepIndex
                      ? "bg-green-600 text-white"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  {index < currentStepIndex ? (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    index + 1
                  )}
                </div>
                {index < STEPS.length - 1 && (
                  <div
                    className={`flex-1 h-1 mx-2 ${
                      index < currentStepIndex ? "bg-green-600" : "bg-gray-200"
                    }`}
                  />
                )}
              </div>
            ))}
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
            <CourseSearch
              onSelect={setSelectedCourse}
              selectedCourse={selectedCourse}
            />
          </div>
        )}

        {currentStep === "tee" && selectedCourse && (
          <TeeSelector
            courseId={selectedCourse.id}
            onSelect={setSelectedTee}
            selectedTee={selectedTee}
          />
        )}

        {currentStep === "type" && (
          <div className="space-y-6">
            <RoundTypeSelector value={roundType} onChange={setRoundType} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Round Date
              </label>
              <input
                type="date"
                value={roundDate}
                onChange={(e) => setRoundDate(e.target.value)}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
              />
            </div>
          </div>
        )}

        {currentStep === "players" && selectedTee && currentUser && (
          <PlayerSetup
            defaultTee={selectedTee}
            availableTees={availableTees}
            currentUserId={currentUser.id}
            currentUserName={currentUser.display_name}
            players={players}
            onPlayersChange={handlePlayersChange}
          />
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

      {/* Footer Actions */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4">
        <div className="max-w-2xl mx-auto flex gap-3">
          {currentStepIndex > 0 && (
            <button
              type="button"
              onClick={goBack}
              className="flex-1 py-3 px-4 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50"
            >
              Back
            </button>
          )}
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

      {/* Bottom padding for fixed footer */}
      <div className="h-24" />
    </div>
  );
}
