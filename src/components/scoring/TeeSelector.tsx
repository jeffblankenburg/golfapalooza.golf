"use client";

import { useState, useEffect } from "react";
import type { CourseTee } from "@/types/golf";

interface TeeSelectorProps {
  courseId: string;
  onSelect: (tee: CourseTee) => void;
  selectedTee?: CourseTee | null;
}

const TEE_COLORS: Record<string, string> = {
  black: "bg-gray-900",
  blue: "bg-blue-600",
  white: "bg-white border-2 border-gray-300",
  gold: "bg-yellow-500",
  red: "bg-red-600",
  green: "bg-green-600",
  silver: "bg-gray-400",
};

export function TeeSelector({ courseId, onSelect, selectedTee }: TeeSelectorProps) {
  const [tees, setTees] = useState<CourseTee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTees() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/courses/${courseId}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to fetch course details");
        }

        setTees(data.course?.tees || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load tees");
      } finally {
        setIsLoading(false);
      }
    }

    if (courseId) {
      fetchTees();
    }
  }, [courseId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        {error}
      </div>
    );
  }

  if (tees.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-700">
        No tee information available for this course.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Select Tees
      </label>
      <div className="grid gap-3">
        {tees.map((tee) => {
          const colorClass = tee.tee_color
            ? TEE_COLORS[tee.tee_color.toLowerCase()] || "bg-gray-200"
            : "bg-gray-200";
          const isSelected = selectedTee?.id === tee.id;

          return (
            <button
              key={tee.id}
              type="button"
              onClick={() => onSelect(tee)}
              className={`flex items-center gap-4 p-4 rounded-lg border-2 transition-colors ${
                isSelected
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 hover:border-green-300 bg-white"
              }`}
            >
              <div className={`w-6 h-6 rounded-full ${colorClass} flex-shrink-0`} />
              <div className="flex-1 text-left">
                <div className="font-medium text-gray-900">{tee.tee_name}</div>
                <div className="text-sm text-gray-500">
                  Rating: {tee.course_rating} / Slope: {tee.slope_rating} / Par: {tee.par}
                </div>
              </div>
              {isSelected && (
                <svg className="w-6 h-6 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
