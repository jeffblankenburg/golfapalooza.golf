"use client";

interface MappedStatusBadgeProps {
  fullyMappedHoles: number;
  totalHoles: number;
  setPoints?: number;
  totalPoints?: number;
  variant?: "compact" | "verbose";
}

/**
 * Issue #133. Small badge showing how mapped a course / tee is. Used on
 * the courses list and on per-tee headers.
 *
 * - "Not mapped" — totalHoles === 0 (no tees yet, or no holes)
 * - "✓ Fully mapped" — every hole has all five points
 * - "12/18 holes" — partial mapping
 */
export function MappedStatusBadge({
  fullyMappedHoles,
  totalHoles,
  setPoints,
  totalPoints,
  variant = "compact",
}: MappedStatusBadgeProps) {
  if (totalHoles === 0) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-gray-100 text-gray-500 rounded-md">
        Not mapped
      </span>
    );
  }
  if (fullyMappedHoles === totalHoles) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold bg-green-50 text-green-700 rounded-md">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
        Fully mapped
      </span>
    );
  }
  if (variant === "verbose" && setPoints != null && totalPoints != null) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 rounded-md">
        {fullyMappedHoles}/{totalHoles} holes · {setPoints}/{totalPoints} points
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 rounded-md">
      {fullyMappedHoles}/{totalHoles} holes mapped
    </span>
  );
}
