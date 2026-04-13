"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PinnedNoteButton } from "@/components/notebook/PinnedNoteButton";

interface ActionItem {
  id: string;
  title: string;
  description: string | null;
  deadline: string | null;
  link: string | null;
  sort_order: number;
}

interface Completion {
  action_item_id: string;
  completed_at: string;
}

function getDeadlineInfo(deadline: string | null, isCompleted: boolean) {
  if (!deadline) return null;

  const [year, month, day] = deadline.split("-").map(Number);
  const deadlineDate = new Date(year, month - 1, day);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const diffMs = deadlineDate.getTime() - today.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

  const formatted = deadlineDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  if (isCompleted) {
    return { text: formatted, className: "text-gray-400" };
  }

  if (diffDays < 0) {
    return { text: `Overdue - ${formatted}`, className: "text-red-500 font-medium" };
  }
  if (diffDays === 0) {
    return { text: `Due today`, className: "text-amber-600 font-medium" };
  }
  if (diffDays <= 3) {
    return { text: `Due ${formatted}`, className: "text-amber-600" };
  }
  return { text: `Due ${formatted}`, className: "text-gray-400" };
}

export function ActionItemsList({
  items,
  completions,
}: {
  items: ActionItem[];
  completions: Completion[];
}) {
  const router = useRouter();
  const [completedIds, setCompletedIds] = useState<Set<string>>(
    () => new Set(completions.map((c) => c.action_item_id))
  );

  const toggleCompletion = async (itemId: string) => {
    const wasCompleted = completedIds.has(itemId);
    const next = new Set(completedIds);

    if (wasCompleted) {
      next.delete(itemId);
    } else {
      next.add(itemId);
    }
    setCompletedIds(next);

    try {
      await fetch("/api/action-items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action_item_id: itemId,
          completed: !wasCompleted,
        }),
      });
    } catch {
      // Revert on error
      setCompletedIds(completedIds);
    }
  };

  const completedCount = completedIds.size;
  const totalCount = items.length;

  return (
    <div className="px-4 pt-6 pb-8">
      <div className="flex items-center gap-2 mb-1">
        <h1 className="text-2xl font-bold text-gray-900">Action Items</h1>
        <PinnedNoteButton pinnedTo="action_items" />
      </div>
      <p className="text-sm text-gray-500 mb-6">
        {completedCount} of {totalCount} completed
      </p>

      {items.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          No action items yet.
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm divide-y divide-gray-100">
          {items.map((item) => {
            const isCompleted = completedIds.has(item.id);
            const deadlineInfo = getDeadlineInfo(item.deadline, isCompleted);

            return (
              <div
                key={item.id}
                className="flex items-start gap-3 px-4 py-3.5"
              >
                {/* Checkbox */}
                <button
                  onClick={() => toggleCompletion(item.id)}
                  className="flex-shrink-0 mt-0.5"
                >
                  <div
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isCompleted
                        ? "bg-green-600 border-green-600"
                        : "border-gray-300"
                    }`}
                  >
                    {isCompleted && (
                      <svg
                        className="w-3.5 h-3.5 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </div>
                </button>

                {/* Content */}
                <button
                  onClick={() => {
                    if (item.link) {
                      router.push(item.link);
                    } else {
                      toggleCompletion(item.id);
                    }
                  }}
                  className="flex-1 text-left min-w-0"
                >
                  <p
                    className={`text-sm font-medium ${
                      isCompleted
                        ? "text-gray-400 line-through"
                        : "text-gray-900"
                    }`}
                  >
                    {item.title}
                  </p>
                  {item.description && (
                    <p
                      className={`text-xs mt-0.5 ${
                        isCompleted ? "text-gray-300" : "text-gray-500"
                      }`}
                    >
                      {item.description}
                    </p>
                  )}
                  {deadlineInfo && (
                    <p className={`text-xs mt-1 ${deadlineInfo.className}`}>
                      {deadlineInfo.text}
                    </p>
                  )}
                </button>

                {/* Link chevron */}
                {item.link && (
                  <svg
                    className="w-4 h-4 text-gray-300 flex-shrink-0 mt-1"
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
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
