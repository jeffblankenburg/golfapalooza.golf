"use client";

import { getScoreColorClass } from "@/lib/golf/calculator";

interface ScoreInputProps {
  value: number | null;
  par: number;
  onChange: (value: number | null) => void;
  min?: number;
  max?: number;
}

export default function ScoreInput({ value, par, onChange, min = 1, max = 15 }: ScoreInputProps) {
  const colorClass = value != null ? getScoreColorClass(value, par) : "";

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => {
          if (value != null && value > min) onChange(value - 1);
        }}
        disabled={value == null || value <= min}
        className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 text-xl font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 transition-colors"
      >
        −
      </button>

      <div
        className={`w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold ${
          colorClass || "bg-gray-100 text-gray-400"
        }`}
      >
        {value ?? "–"}
      </div>

      <button
        type="button"
        onClick={() => {
          if (value == null) {
            onChange(par);
          } else if (value < max) {
            onChange(value + 1);
          }
        }}
        disabled={value != null && value >= max}
        className="w-10 h-10 rounded-full bg-gray-100 text-gray-700 text-xl font-bold flex items-center justify-center hover:bg-gray-200 disabled:opacity-30 transition-colors"
      >
        +
      </button>
    </div>
  );
}
