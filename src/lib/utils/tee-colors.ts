/** Tailwind class names for tee dot colors */
export const TEE_DOT_COLORS: Record<string, string> = {
  Black: "bg-gray-900",
  Blue: "bg-blue-600",
  White: "bg-white border border-gray-400",
  Gold: "bg-yellow-500",
  Green: "bg-green-600",
  Red: "bg-red-600",
  Silver: "bg-gray-400",
};

/** Hex values for tee colors (used for gradients) */
export const TEE_HEX_COLORS: Record<string, string> = {
  Black: "#111827",
  Blue: "#2563eb",
  White: "#f3f4f6",
  Gold: "#eab308",
  Green: "#16a34a",
  Red: "#dc2626",
  Silver: "#9ca3af",
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
