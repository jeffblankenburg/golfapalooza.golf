"use client";

import { useState } from "react";

interface CollapsibleSectionProps {
  title: string;
  summary: string;
  icon: React.ReactNode;
  iconColor?: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}

export function CollapsibleSection({
  title,
  summary,
  icon,
  iconColor,
  defaultOpen = false,
  badge,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  const bgMap: Record<string, string> = {
    "text-green-700": "bg-green-50",
    "text-red-700": "bg-red-50",
    "text-teal-700": "bg-teal-50",
    "text-blue-700": "bg-blue-50",
    "text-orange-700": "bg-orange-50",
    "text-purple-700": "bg-purple-50",
    "text-amber-700": "bg-amber-50",
    "text-indigo-700": "bg-indigo-50",
  };
  const iconText = iconColor || "text-green-700";
  const iconBg = bgMap[iconText] || "bg-green-50";

  const toggle = () => setOpen(!open);

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div
        role="button"
        tabIndex={0}
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            toggle();
          }
        }}
        className="w-full flex items-center gap-3 px-4 py-4 text-left active:bg-gray-50 transition-colors cursor-pointer select-none"
      >
        <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${iconBg} ${iconText} flex items-center justify-center`}>
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-gray-900">{title}</div>
          <div className="text-xs text-gray-500 truncate">{summary}</div>
        </div>
        {badge}
        <svg
          className={`w-5 h-5 text-gray-400 transition-transform ${
            open ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
      {open && (
        <div className="border-t border-gray-100 px-4 py-4">{children}</div>
      )}
    </div>
  );
}
