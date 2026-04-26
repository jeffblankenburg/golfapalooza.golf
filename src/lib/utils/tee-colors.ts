/** Tailwind class names for tee dot colors (case-insensitive lookup) */
export const TEE_DOT_COLORS: Record<string, string> = {
  black: "bg-gray-900", Black: "bg-gray-900",
  blue: "bg-blue-600", Blue: "bg-blue-600",
  white: "bg-white border border-gray-400", White: "bg-white border border-gray-400",
  gold: "bg-yellow-500", Gold: "bg-yellow-500",
  yellow: "bg-yellow-400", Yellow: "bg-yellow-400",
  green: "bg-green-600", Green: "bg-green-600",
  red: "bg-red-600", Red: "bg-red-600",
  silver: "bg-gray-400", Silver: "bg-gray-400",
  orange: "bg-orange-500", Orange: "bg-orange-500",
  purple: "bg-purple-600", Purple: "bg-purple-600",
  pink: "bg-pink-500", Pink: "bg-pink-500",
  navy: "bg-blue-900", Navy: "bg-blue-900",
  teal: "bg-teal-500", Teal: "bg-teal-500",
  brown: "bg-amber-800", Brown: "bg-amber-800",
  copper: "bg-amber-700", Copper: "bg-amber-700",
  bronze: "bg-amber-600", Bronze: "bg-amber-600",
  burgundy: "bg-red-900", Burgundy: "bg-red-900",
};

/** Hex values for tee colors (case-insensitive lookup) */
export const TEE_HEX_COLORS: Record<string, string> = {
  black: "#111827", Black: "#111827",
  blue: "#2563eb", Blue: "#2563eb",
  white: "#f3f4f6", White: "#f3f4f6",
  gold: "#eab308", Gold: "#eab308",
  yellow: "#facc15", Yellow: "#facc15",
  green: "#16a34a", Green: "#16a34a",
  red: "#dc2626", Red: "#dc2626",
  silver: "#9ca3af", Silver: "#9ca3af",
  orange: "#f97316", Orange: "#f97316",
  purple: "#9333ea", Purple: "#9333ea",
  pink: "#ec4899", Pink: "#ec4899",
  navy: "#1e3a8a", Navy: "#1e3a8a",
  teal: "#14b8a6", Teal: "#14b8a6",
  brown: "#92400e", Brown: "#92400e",
  copper: "#b45309", Copper: "#b45309",
  bronze: "#d97706", Bronze: "#d97706",
  burgundy: "#7f1d1d", Burgundy: "#7f1d1d",
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
