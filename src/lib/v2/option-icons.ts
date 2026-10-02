/**
 * Option + group icons (#218). v2 uses emoji (consistent with cost categories)
 * instead of v1's ~80 hand-drawn SVGs — lighter, colorful, renders everywhere.
 * Stored as the emoji string in v2_options.icon / v2_option_groups.icon.
 * The picker groups them like v1's categorized icon library.
 */

export interface IconCategory {
  category: string;
  icons: string[];
}

export const OPTION_ICON_CATEGORIES: IconCategory[] = [
  { category: "Money", icons: ["💵", "💳", "🧾", "🏷️", "👛", "🏦", "🪙", "📊", "％"] },
  { category: "Lodging", icons: ["🏨", "🛏️", "🌙", "🔑", "🏠", "📍", "🧳", "✈️", "🚗"] },
  { category: "Food & drink", icons: ["🍽️", "☕", "🍺", "🎂", "🍷", "🍕", "🛒", "🔥", "🍦", "🥤"] },
  { category: "Golf", icons: ["⛳", "🎯", "🏌️", "🏆", "🛺", "📋", "🏅", "🏁", "🏌️‍♀️"] },
  { category: "Contests", icons: ["🚩", "🏈", "🎲", "📏", "🧩", "⚡", "⚖️", "👑", "🎖️", "🎟️", "🏓"] },
  { category: "Apparel", icons: ["👕", "🧢", "🕶️", "👟", "🧤", "🎒"] },
  { category: "Sports", icons: ["🏀", "⚾", "⚽", "🎾", "🏊", "🎳", "🥏", "🏒"] },
  { category: "Health", icons: ["❤️", "🛡️", "🩹", "⚠️", "🚑"] },
  { category: "Comms", icons: ["📞", "✉️", "💬", "📣", "🔔", "📷", "🎥"] },
  { category: "Weather", icons: ["☀️", "☁️", "🌧️", "❄️", "🌳", "⛰️", "🌊"] },
  { category: "Tools", icons: ["🔧", "⚙️", "🔩", "🔒", "🔓", "📄", "🖊️", "⭐"] },
];

export const ALL_OPTION_ICONS = OPTION_ICON_CATEGORIES.flatMap((c) => c.icons);
