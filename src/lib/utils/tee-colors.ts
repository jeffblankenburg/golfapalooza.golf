/** Tailwind class names for tee dot colors (case-insensitive lookup) */
export const TEE_DOT_COLORS: Record<string, string> = {
  black: "bg-gray-900", Black: "bg-gray-900",
  blue: "bg-blue-600", Blue: "bg-blue-600",
  white: "bg-white border border-gray-400", White: "bg-white border border-gray-400",
  gold: "bg-yellow-500", Gold: "bg-yellow-500",
  green: "bg-green-600", Green: "bg-green-600",
  red: "bg-red-600", Red: "bg-red-600",
  silver: "bg-gray-400", Silver: "bg-gray-400",
};

/** Hex values for tee colors (case-insensitive lookup) */
export const TEE_HEX_COLORS: Record<string, string> = {
  black: "#111827", Black: "#111827",
  blue: "#2563eb", Blue: "#2563eb",
  white: "#f3f4f6", White: "#f3f4f6",
  gold: "#eab308", Gold: "#eab308",
  green: "#16a34a", Green: "#16a34a",
  red: "#dc2626", Red: "#dc2626",
  silver: "#9ca3af", Silver: "#9ca3af",
};

/**
 * Get dot styling for a tee color.
 * For regular tees: returns { className }.
 * For composition tees (e.g., "Black/Blue"): returns { style } with a gradient.
 */
export function getTeeDotStyle(teeColor: string | null | undefined): {
  className?: string;
  style?: React.CSSProperties;
} {
  const color = teeColor || "";

  // Check for composition tee (contains "/")
  if (color.includes("/")) {
    const parts = color.split("/").map((c) => c.trim());
    const hexColors = parts.map((c) => TEE_HEX_COLORS[c] || "#9ca3af");
    return {
      style: {
        background: `linear-gradient(135deg, ${hexColors[0]} 50%, ${hexColors[1] || hexColors[0]} 50%)`,
        border: hexColors.includes("#f3f4f6") ? "1px solid #9ca3af" : undefined,
      },
    };
  }

  return { className: TEE_DOT_COLORS[color] || "bg-gray-300" };
}
