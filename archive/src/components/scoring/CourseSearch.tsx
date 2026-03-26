"use client";

import { useState, useEffect, useRef } from "react";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { Course } from "@/types/golf";

interface CourseSearchProps {
  onSelect: (course: Course) => void;
  selectedCourse?: Course | null;
  onLocationEnabled?: () => void;
}

export function CourseSearch({ onSelect, selectedCourse, onLocationEnabled }: CourseSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [locationBannerDismissed, setLocationBannerDismissed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const {
    permissionState,
    loading: locationLoading,
    requestLocation,
    checkPermission,
  } = useGeolocation();

  // Check permission status on mount
  useEffect(() => {
    checkPermission();
  }, [checkPermission]);

  const handleEnableLocation = async () => {
    const location = await requestLocation();
    if (location && onLocationEnabled) {
      onLocationEnabled();
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    if (query.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch(`/api/courses?q=${encodeURIComponent(query)}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || "Failed to search courses");
        }

        setResults(data.courses || []);
        setIsOpen(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Search failed");
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [query]);

  const handleSelect = (course: Course) => {
    onSelect(course);
    setQuery("");
    setIsOpen(false);
    setResults([]);
  };

  const handleClear = () => {
    onSelect(null as unknown as Course);
    setQuery("");
  };

  if (selectedCourse) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-green-900">{selectedCourse.name}</h3>
            <p className="text-sm text-green-700">
              {selectedCourse.city}, {selectedCourse.state}
            </p>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-green-600 hover:text-green-800 text-sm font-medium"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  // Determine what to show in the location banner
  const showLocationBanner = !locationBannerDismissed && permissionState !== "granted";
  const isLocationDenied = permissionState === "denied";

  return (
    <div ref={containerRef} className="relative space-y-4">
      {/* Location Permission Banner */}
      {showLocationBanner && (
        <div className={`rounded-lg p-4 ${isLocationDenied ? "bg-gray-50 border border-gray-200" : "bg-blue-50 border border-blue-200"}`}>
          <div className="flex items-start gap-3">
            <div className={`flex-shrink-0 ${isLocationDenied ? "text-gray-400" : "text-blue-500"}`}>
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
            </div>
            <div className="flex-1 min-w-0">
              {isLocationDenied ? (
                <>
                  <p className="text-sm font-medium text-gray-700">Location access denied</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Enable location in your browser settings to auto-detect courses
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-medium text-blue-800">Find courses near you</p>
                  <p className="text-xs text-blue-600 mt-0.5">
                    Enable location to automatically find nearby courses
                  </p>
                </>
              )}
            </div>
            <div className="flex-shrink-0 flex items-center gap-2">
              {!isLocationDenied && (
                <button
                  type="button"
                  onClick={handleEnableLocation}
                  disabled={locationLoading}
                  className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
                >
                  {locationLoading ? (
                    <span className="flex items-center gap-1">
                      <div className="animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full" />
                      <span>...</span>
                    </span>
                  ) : (
                    "Enable"
                  )}
                </button>
              )}
              <button
                type="button"
                onClick={() => setLocationBannerDismissed(true)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Search Input */}
      <div className="relative">
        <label htmlFor="course-search" className="block text-sm font-medium text-gray-700 mb-1">
          Search for a Golf Course
        </label>
        <div className="relative">
          <input
            id="course-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Enter course name or city..."
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 text-gray-900 bg-white placeholder-gray-400"
          />
          {isLoading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              <div className="animate-spin h-5 w-5 border-2 border-green-500 border-t-transparent rounded-full" />
            </div>
          )}
        </div>

        {error && (
          <p className="mt-2 text-sm text-red-600">{error}</p>
        )}

        {isOpen && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
            {results.map((course) => (
              <button
                key={course.id}
                type="button"
                onClick={() => handleSelect(course)}
                className="w-full px-4 py-3 text-left hover:bg-green-50 border-b border-gray-100 last:border-b-0"
              >
                <div className="font-medium text-gray-900">{course.name}</div>
                <div className="text-sm text-gray-500">
                  {course.city}, {course.state} - {course.hole_count} holes
                </div>
              </button>
            ))}
          </div>
        )}

        {isOpen && results.length === 0 && !isLoading && query.length >= 2 && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg p-4 text-center text-gray-500">
            No courses found
          </div>
        )}
      </div>
    </div>
  );
}
