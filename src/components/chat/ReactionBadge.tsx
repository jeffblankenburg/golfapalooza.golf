"use client";

export function ReactionBadge({
  emoji,
  count,
  hasOwn,
  onClick,
}: {
  emoji: string;
  count: number;
  hasOwn: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs border transition-colors ${
        hasOwn
          ? "bg-green-50 border-green-300 text-green-700"
          : "bg-gray-50 border-gray-200 text-gray-600"
      }`}
    >
      <span className="text-sm">{emoji}</span>
      {count > 1 && <span className="font-medium">{count}</span>}
    </button>
  );
}
