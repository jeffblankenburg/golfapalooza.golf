// Lightweight loading placeholders. Used in `loading.tsx` files to give
// users a structured wireframe of the destination while the server fetches.
//
// Animation comes from a single `bg-gray-200 animate-pulse` — no JS, no
// libraries. Compose these to mimic the real layout's shape.

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-200 rounded-md animate-pulse ${className}`} />;
}

export function SkeletonCircle({ className = "" }: { className?: string }) {
  return <div className={`bg-gray-200 rounded-full animate-pulse ${className}`} />;
}

export function SkeletonText({
  lines = 1,
  className = "",
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={`space-y-1.5 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className={`h-3 bg-gray-200 rounded animate-pulse ${
            i === lines - 1 && lines > 1 ? "w-2/3" : "w-full"
          }`}
        />
      ))}
    </div>
  );
}
