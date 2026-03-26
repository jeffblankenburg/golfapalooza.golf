"use client";

interface ScoreInputProps {
  value: number | null;
  par: number;
  onChange: (value: number) => void;
  disabled?: boolean;
  size?: "sm" | "md" | "lg";
}

export function ScoreInput({
  value,
  par,
  onChange,
  disabled = false,
  size = "md",
}: ScoreInputProps) {
  const displayValue = value ?? 0;

  const getScoreColor = () => {
    if (value === null || value === 0) return "text-gray-400";
    if (value < par) return "text-green-600"; // Under par (birdie or better)
    if (value === par) return "text-gray-900"; // Par
    if (value === par + 1) return "text-yellow-600"; // Bogey
    return "text-red-600"; // Double bogey or worse
  };

  const getScoreLabel = () => {
    if (value === null || value === 0) return "";
    const diff = value - par;
    if (diff <= -2) return "Eagle+";
    if (diff === -1) return "Birdie";
    if (diff === 0) return "Par";
    if (diff === 1) return "Bogey";
    if (diff === 2) return "Double";
    return `+${diff}`;
  };

  const sizeClasses = {
    sm: {
      button: "w-8 h-8 text-lg",
      value: "text-xl min-w-[2rem]",
      container: "gap-1",
    },
    md: {
      button: "w-10 h-10 text-xl",
      value: "text-2xl min-w-[2.5rem]",
      container: "gap-2",
    },
    lg: {
      button: "w-14 h-14 text-2xl",
      value: "text-4xl min-w-[3.5rem]",
      container: "gap-3",
    },
  };

  const classes = sizeClasses[size];

  return (
    <div className={`flex flex-col items-center ${classes.container}`}>
      <div className={`flex items-center ${classes.container}`}>
        <button
          type="button"
          onClick={() => onChange(Math.max(1, displayValue - 1))}
          disabled={disabled || displayValue <= 1}
          className={`${classes.button} rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-600`}
        >
          -
        </button>

        <span
          className={`${classes.value} font-bold text-center ${getScoreColor()}`}
        >
          {displayValue || "-"}
        </span>

        <button
          type="button"
          onClick={() => onChange(displayValue + 1)}
          disabled={disabled}
          className={`${classes.button} rounded-full bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center font-bold text-gray-600`}
        >
          +
        </button>
      </div>

      {value !== null && value > 0 && (
        <span className={`text-xs ${getScoreColor()}`}>{getScoreLabel()}</span>
      )}
    </div>
  );
}
