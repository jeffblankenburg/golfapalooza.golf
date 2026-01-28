"use client";

import { useState, useEffect, useRef } from "react";
import type { Course } from "@/types/golf";

interface CourseSearchProps {
  onSelect: (course: Course) => void;
  selectedCourse?: Course | null;
}

export function CourseSearch({ onSelect, selectedCourse }: CourseSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

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

  return (
    <div ref={containerRef} className="relative">
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
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500"
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
  );
}
