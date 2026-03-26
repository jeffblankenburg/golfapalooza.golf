"use client";

import type { RoundType } from "@/types/golf";

interface RoundTypeSelectorProps {
  value: RoundType;
  onChange: (type: RoundType) => void;
}

const ROUND_TYPES: { value: RoundType; label: string; description: string }[] = [
  {
    value: "18",
    label: "Full 18 Holes",
    description: "Play all 18 holes",
  },
  {
    value: "9-front",
    label: "Front 9",
    description: "Holes 1-9",
  },
  {
    value: "9-back",
    label: "Back 9",
    description: "Holes 10-18",
  },
];

export function RoundTypeSelector({ value, onChange }: RoundTypeSelectorProps) {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Round Type
      </label>
      <div className="grid grid-cols-3 gap-3">
        {ROUND_TYPES.map((type) => (
          <button
            key={type.value}
            type="button"
            onClick={() => onChange(type.value)}
            className={`p-4 rounded-lg border-2 transition-colors text-center ${
              value === type.value
                ? "border-green-500 bg-green-50"
                : "border-gray-200 hover:border-green-300 bg-white"
            }`}
          >
            <div className="font-medium text-gray-900">{type.label}</div>
            <div className="text-xs text-gray-500 mt-1">{type.description}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
