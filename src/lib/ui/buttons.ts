// Subtle-button presets for chrome-level action affordances (see issue #119).
// NOT for primary CTAs (big solid-green buttons keep their per-page styles) and
// NOT for inline links inside markdown content (`prose` context — those stay
// underlined.)

export const BTN_NEUTRAL =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-gray-100 text-gray-700 border border-gray-200 active:bg-gray-200 transition-colors";

export const BTN_PRIMARY =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-green-50 text-green-700 border border-green-200 active:bg-green-100 transition-colors";

export const BTN_DESTRUCTIVE =
  "px-3 py-1.5 rounded-lg text-sm font-medium bg-red-50 text-red-600 border border-red-200 active:bg-red-100 transition-colors";

export const BTN_BACK =
  "inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 active:bg-gray-100 transition-colors";
