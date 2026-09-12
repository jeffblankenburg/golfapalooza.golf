export const TEE_COLOR_OPTIONS = [
  { value: "black", label: "Black", bg: "bg-gray-900", text: "text-white", ring: "ring-gray-900" },
  { value: "blue", label: "Blue", bg: "bg-blue-600", text: "text-white", ring: "ring-blue-600" },
  { value: "white", label: "White", bg: "bg-white border border-gray-300", text: "text-gray-900", ring: "ring-gray-400" },
  { value: "gold", label: "Gold", bg: "bg-yellow-400", text: "text-gray-900", ring: "ring-yellow-400" },
  { value: "red", label: "Red", bg: "bg-red-600", text: "text-white", ring: "ring-red-600" },
  { value: "green", label: "Green", bg: "bg-green-700", text: "text-white", ring: "ring-green-700" },
  { value: "silver", label: "Silver", bg: "bg-gray-400", text: "text-white", ring: "ring-gray-400" },
];

export function isHexColor(color: string | null): boolean {
  return !!color && /^#[0-9a-fA-F]{6}$/.test(color);
}

export function getContrastText(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "text-gray-900" : "text-white";
}

const TEE_HEX_MAP: Record<string, string> = {
  black: "#111827",
  blue: "#2563eb",
  white: "#f3f4f6",
  gold: "#eab308",
  red: "#dc2626",
  green: "#15803d",
  silver: "#9ca3af",
  Black: "#111827",
  Blue: "#2563eb",
  White: "#f3f4f6",
  Gold: "#eab308",
  Red: "#dc2626",
  Green: "#15803d",
  Silver: "#9ca3af",
};

export function getTeeColorClasses(color: string | null) {
  const match = TEE_COLOR_OPTIONS.find((c) => c.value === color);
  if (match) return { ...match, isCustom: false, hex: null, isGradient: false, gradientHex: null as string | null };

  // Composition tee gradient (e.g., "Black/Blue")
  if (color && color.includes("/")) {
    const parts = color.split("/").map((c) => c.trim());
    const hex1 = TEE_HEX_MAP[parts[0]] || "#9ca3af";
    const hex2 = TEE_HEX_MAP[parts[1]] || "#9ca3af";
    const gradient = `linear-gradient(135deg, ${hex1} 50%, ${hex2} 50%)`;
    return {
      bg: "",
      text: "text-white",
      ring: "ring-gray-400",
      isCustom: true,
      hex: null,
      isGradient: true,
      gradientHex: gradient,
    };
  }

  if (isHexColor(color))
    return { bg: "", text: getContrastText(color!), ring: "", isCustom: true, hex: color, isGradient: false, gradientHex: null as string | null };
  return { bg: "bg-gray-100", text: "text-gray-600", ring: "ring-gray-300", isCustom: false, hex: null, isGradient: false, gradientHex: null as string | null };
}
