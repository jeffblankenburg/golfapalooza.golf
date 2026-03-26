"use client";

import { useState, useEffect, useCallback } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { Course } from "@/types/golf";

interface CourseWithDistance extends Course {
  distance: number;
}

interface NearbyCourseSuggestionProps {
  onCourseSelect: (course: Course) => void;
  onSearchInstead: () => void;
}

type DetectionState =
  | "requesting-permission"
  | "locating"
  | "searching"
  | "found"
  | "not-found"
  | "location-denied"
  | "location-error"
  | "search-error";

export function NearbyCourseSuggestion({
  onCourseSelect,
  onSearchInstead,
}: NearbyCourseSuggestionProps) {
  const { requestLocation, permissionState } = useGeolocation();
  const [nearbyCourses, setNearbyCourses] = useState<CourseWithDistance[]>([]);
  const [detectionState, setDetectionState] = useState<DetectionState>("requesting-permission");

  const detectCourse = useCallback(async () => {
    setDetectionState("locating");

    const location = await requestLocation();

    if (!location) {
      // Check if it was a permission issue
      if (permissionState === "denied") {
        setDetectionState("location-denied");
      } else {
        setDetectionState("location-error");
      }
      return;
    }

    setDetectionState("searching");

    try {
      const response = await fetch(
        `/api/courses?lat=${location.latitude}&lng=${location.longitude}&radius=2`
      );
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to search nearby courses");
      }

      if (data.courses && data.courses.length > 0) {
        setNearbyCourses(data.courses);
        setDetectionState("found");
      } else {
        setDetectionState("not-found");
      }
    } catch {
      setDetectionState("search-error");
    }
  }, [requestLocation, permissionState]);

  useEffect(() => {
    detectCourse();
  }, [detectCourse]);

  // Status indicator component
  const StatusIndicator = ({
    step,
    status,
    label,
  }: {
    step: number;
    status: "complete" | "active" | "pending" | "error";
    label: string;
  }) => (
    <div className="flex items-center gap-3">
      <div
        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          status === "complete"
            ? "bg-green-600 text-white"
            : status === "active"
            ? "bg-blue-600 text-white animate-pulse"
            : status === "error"
            ? "bg-red-500 text-white"
            : "bg-gray-200 text-gray-500"
        }`}
      >
        {status === "complete" ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        ) : status === "error" ? (
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        ) : (
          step
        )}
      </div>
      <span
        className={`text-sm font-medium ${
          status === "active"
            ? "text-blue-700"
            : status === "error"
            ? "text-red-700"
            : status === "complete"
            ? "text-green-700"
            : "text-gray-500"
        }`}
      >
        {label}
      </span>
    </div>
  );

  // Determine step statuses
  const getLocationStatus = () => {
    if (detectionState === "requesting-permission" || detectionState === "locating") {
      return "active";
    }
    if (detectionState === "location-denied" || detectionState === "location-error") {
      return "error";
    }
    return "complete";
  };

  const getSearchStatus = () => {
    if (
      detectionState === "requesting-permission" ||
      detectionState === "locating" ||
      detectionState === "location-denied" ||
      detectionState === "location-error"
    ) {
      return "pending";
    }
    if (detectionState === "searching") {
      return "active";
    }
    if (detectionState === "search-error") {
      return "error";
    }
    return "complete";
  };

  // Loading/detecting states with status indicators
  if (
    detectionState === "requesting-permission" ||
    detectionState === "locating" ||
    detectionState === "searching"
  ) {
    return (
      <div className="space-y-6">
        {/* Status Steps */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <StatusIndicator
            step={1}
            status={getLocationStatus()}
            label={
              detectionState === "requesting-permission"
                ? "Requesting location access..."
                : detectionState === "locating"
                ? "Getting your location..."
                : "Location found"
            }
          />
          <StatusIndicator
            step={2}
            status={getSearchStatus()}
            label={
              detectionState === "searching"
                ? "Searching for nearby courses..."
                : "Find nearby courses"
            }
          />
        </div>

        {/* Loading animation */}
        <div className="flex justify-center py-4">
          <div className="animate-spin h-8 w-8 border-3 border-green-500 border-t-transparent rounded-full" />
        </div>

        <button
          type="button"
          onClick={onSearchInstead}
          className="w-full py-3 text-green-600 font-medium hover:bg-green-50 rounded-lg transition-colors"
        >
          Skip and search manually
        </button>
      </div>
    );
  }

  // Location permission denied
  if (detectionState === "location-denied") {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <StatusIndicator step={1} status="error" label="Location access denied" />
          <StatusIndicator step={2} status="pending" label="Find nearby courses" />
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-medium text-red-800">Location permission denied</p>
              <p className="text-sm text-red-700 mt-1">
                To automatically find courses near you, please enable location access in your
                browser settings and refresh the page.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onSearchInstead}
          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
        >
          Search for a course instead
        </button>
      </div>
    );
  }

  // Location error (not denied, but couldn't get location)
  if (detectionState === "location-error") {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <StatusIndicator step={1} status="error" label="Could not get location" />
          <StatusIndicator step={2} status="pending" label="Find nearby courses" />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-medium text-amber-800">Unable to determine your location</p>
              <p className="text-sm text-amber-700 mt-1">
                This could be due to poor GPS signal or your device&apos;s location services being
                disabled.
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            onClick={detectCourse}
            className="flex-1 py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            Enable Location
          </button>
          <button
            type="button"
            onClick={onSearchInstead}
            className="flex-1 py-3 px-4 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            Search instead
          </button>
        </div>
      </div>
    );
  }

  // Search error
  if (detectionState === "search-error") {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <StatusIndicator step={1} status="complete" label="Location found" />
          <StatusIndicator step={2} status="error" label="Course search failed" />
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="font-medium text-amber-800">Could not search for courses</p>
              <p className="text-sm text-amber-700 mt-1">
                We found your location but couldn&apos;t search for nearby courses. Please try
                searching manually.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onSearchInstead}
          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
        >
          Search for a course
        </button>
      </div>
    );
  }

  // Not found state - location worked but no courses nearby
  if (detectionState === "not-found") {
    return (
      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
          <StatusIndicator step={1} status="complete" label="Location found" />
          <StatusIndicator step={2} status="complete" label="Search complete" />
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <svg
              className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <div>
              <p className="font-medium text-blue-800">No golf courses found within 2 miles</p>
              <p className="text-sm text-blue-700 mt-1">
                We successfully got your location, but there are no golf courses in our database
                within 2 miles of where you are. Please search for your course by name.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={onSearchInstead}
          className="w-full py-3 px-4 bg-green-600 hover:bg-green-700 text-white font-medium rounded-lg transition-colors"
        >
          Search for a course
        </button>
      </div>
    );
  }

  // Found courses - show suggestions
  const primaryCourse = nearbyCourses[0];
  const otherCourses = nearbyCourses.slice(1, 3);

  return (
    <div className="space-y-4">
      {/* Success status */}
      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
        <svg className="w-5 h-5 text-green-600" fill="currentColor" viewBox="0 0 20 20">
          <path
            fillRule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-sm font-medium text-green-800">
          Found {nearbyCourses.length} course{nearbyCourses.length !== 1 ? "s" : ""} near you
        </span>
      </div>

      {/* Primary suggestion */}
      <div className="space-y-2">
        <p className="text-sm font-medium text-gray-700">Are you playing at...</p>
        <button
          type="button"
          onClick={() => onCourseSelect(primaryCourse)}
          className="w-full text-left p-4 rounded-lg border-2 border-green-500 bg-green-50 hover:bg-green-100 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-semibold text-gray-900 text-lg">{primaryCourse.name}</div>
              <div className="text-sm text-gray-600">
                {primaryCourse.city}, {primaryCourse.state}
              </div>
              <div className="text-xs text-green-700 mt-1">
                {primaryCourse.distance < 0.1
                  ? "You appear to be here"
                  : `${primaryCourse.distance.toFixed(1)} miles away`}
              </div>
            </div>
            <div className="flex-shrink-0 ml-4">
              <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center">
                <svg
                  className="w-6 h-6 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              </div>
            </div>
          </div>
        </button>
      </div>

      {/* Other nearby courses */}
      {otherCourses.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-gray-500">Other courses nearby</p>
          <div className="space-y-2">
            {otherCourses.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => onCourseSelect(course)}
                className="w-full text-left p-3 rounded-lg border border-gray-200 bg-white hover:border-green-300 hover:bg-green-50 transition-colors"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{course.name}</div>
                    <div className="text-sm text-gray-500">
                      {course.distance.toFixed(1)} miles away
                    </div>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search instead option */}
      <button
        type="button"
        onClick={onSearchInstead}
        className="w-full py-3 text-green-600 font-medium hover:bg-green-50 rounded-lg transition-colors"
      >
        Search for a different course
      </button>
    </div>
  );
}
