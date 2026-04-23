import React from "react";

export interface IconDef {
  key: string;
  label: string;
  category: string;
  svg: React.ReactNode;
}

// Curated icon library for trip options
// Each icon is a 24x24 SVG rendered at whatever size the consumer needs
export const OPTION_ICONS: IconDef[] = [
  // ── Money & Fees ──
  {
    key: "dollar",
    label: "Dollar",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "credit-card",
    label: "Credit Card",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
      </svg>
    ),
  },
  {
    key: "receipt",
    label: "Receipt",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
      </svg>
    ),
  },
  {
    key: "tag",
    label: "Price Tag",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
      </svg>
    ),
  },
  {
    key: "wallet",
    label: "Wallet",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2h14a2 2 0 002-2v-5zm0 0h-4a2 2 0 100 4h4" />
      </svg>
    ),
  },
  {
    key: "bank",
    label: "Bank",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3l9 4.5V9H3V7.5L12 3zM4 9v8m4-8v8m4-8v8m4-8v8m4-8v8M3 17h18v3H3v-3z" />
      </svg>
    ),
  },
  {
    key: "coins",
    label: "Coins",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 8a6 6 0 11-12 0 6 6 0 0112 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 16a6 6 0 11-12 0 6 6 0 0112 0z" />
      </svg>
    ),
  },
  {
    key: "chart-bar",
    label: "Budget",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21V7l4-4v18m4 0V11l4-4v14m4 0V9l-4 4" />
      </svg>
    ),
  },
  {
    key: "percent",
    label: "Percent",
    category: "Money",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 5L5 19" />
        <circle cx="6.5" cy="6.5" r="2.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="17.5" cy="17.5" r="2.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
      </svg>
    ),
  },

  // ── Lodging & Travel ──
  {
    key: "hotel",
    label: "Hotel",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    key: "bed",
    label: "Bed",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v11m0-7h18M3 18h18M5 7V4h14v3M8 11v-1a2 2 0 012-2h0a2 2 0 012 2v1" />
      </svg>
    ),
  },
  {
    key: "moon",
    label: "Night Stay",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
      </svg>
    ),
  },
  {
    key: "key",
    label: "Room Key",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
      </svg>
    ),
  },
  {
    key: "home",
    label: "Home",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    ),
  },
  {
    key: "map-pin",
    label: "Map Pin",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "globe",
    label: "Globe",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M12 21a9 9 0 01-9-9m9 9a9 9 0 009-9m-9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9h18" />
      </svg>
    ),
  },
  {
    key: "suitcase",
    label: "Suitcase",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5V3a2 2 0 012-2h2a2 2 0 012 2v2m-6 0h6m-6 0H5a2 2 0 00-2 2v12a2 2 0 002 2h14a2 2 0 002-2V7a2 2 0 00-2-2h-4M9 12h6" />
      </svg>
    ),
  },
  {
    key: "plane",
    label: "Airplane",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l-7-3V8l7-5 7 5v8l-7 3zm0 0v3m0-22v3m-7 5H2m20 0h-3" />
      </svg>
    ),
  },
  {
    key: "vacation-sun",
    label: "Vacation",
    category: "Lodging",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m8.66-13.66l-.71.71M4.05 19.95l-.71.71M21 12h-1M4 12H3m16.66 7.66l-.71-.71M4.05 4.05l-.71-.71" />
        <circle cx="12" cy="12" r="4" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
      </svg>
    ),
  },

  // ── Food & Drink ──
  {
    key: "utensils",
    label: "Food",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3v18m0-12h6V3m0 18v-9m12-6c0 3-2 6-6 6m6-6v18m0-18c-3 0-6 3-6 6m0 0v12" />
      </svg>
    ),
  },
  {
    key: "coffee",
    label: "Breakfast",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 8h1a4 4 0 010 8h-1M2 8h16v9a4 4 0 01-4 4H6a4 4 0 01-4-4V8zm4-3a2 2 0 114 0M10 5a2 2 0 114 0" />
      </svg>
    ),
  },
  {
    key: "beer",
    label: "Beer",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h1a3 3 0 010 6h-1M4 8h12v10a2 2 0 01-2 2H6a2 2 0 01-2-2V8zm4 3v4m4-4v4" />
      </svg>
    ),
  },
  {
    key: "cake",
    label: "Dessert",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15.546c-.523 0-1.046.151-1.5.454a2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0 2.704 2.704 0 00-3 0 2.704 2.704 0 01-3 0A1.75 1.75 0 003 15.546M12 3v2m3 2.5L13.5 9M9 7.5L10.5 9M5 21h14a2 2 0 002-2v-4H3v4a2 2 0 002 2zM3 15h18v-2a2 2 0 00-2-2H5a2 2 0 00-2 2v2z" />
      </svg>
    ),
  },
  {
    key: "wine",
    label: "Wine",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 2h8l-1 7a5 5 0 01-6 0L8 2zm4 12v7m-3 0h6" />
      </svg>
    ),
  },
  {
    key: "pizza",
    label: "Pizza",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2C6.477 2 2 6.477 2 12l10 10 10-10c0-5.523-4.477-10-10-10z" />
        <circle cx="9" cy="10" r="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="15" cy="10" r="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="12" cy="15" r="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    key: "shopping-cart",
    label: "Shopping Cart",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
    ),
  },
  {
    key: "fire",
    label: "BBQ / Grill",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 5 16.09 5.777 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.879 16.121A3 3 0 1012.015 11L11 14H9c0 .768.293 1.536.879 2.121z" />
      </svg>
    ),
  },
  {
    key: "ice-cream",
    label: "Ice Cream",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 22l-4-10h8l-4 10zm-4-10a4 4 0 118 0H8z" />
      </svg>
    ),
  },
  {
    key: "glass-water",
    label: "Water",
    category: "Food & Drink",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 3h12l-2 18H8L6 3zm0 7h12" />
      </svg>
    ),
  },

  // ── Golf ──
  {
    key: "golf-flag",
    label: "Golf Flag",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21V3l12 4-12 4" />
      </svg>
    ),
  },
  {
    key: "target",
    label: "Target / CTP",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="5.5" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="2" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    key: "arrow-long",
    label: "Long Drive",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8l4 4m0 0l-4 4m4-4H3" />
      </svg>
    ),
  },
  {
    key: "trophy",
    label: "Trophy",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 3h14M5 3v5a7 7 0 0014 0V3M5 3H3v3a3 3 0 003 3m13-6h2v3a3 3 0 01-3 3M12 15v4m-4 2h8" />
      </svg>
    ),
  },
  {
    key: "golf-cart",
    label: "Golf Cart",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 17a2 2 0 100 4 2 2 0 000-4zm0 0h8m-8 0V9h3l3 4h5a2 2 0 012 2v2m0 0a2 2 0 100 4 2 2 0 000-4zm-5 0h5M8 9V5h6" />
      </svg>
    ),
  },
  {
    key: "scorecard",
    label: "Scorecard",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
      </svg>
    ),
  },
  {
    key: "medal",
    label: "Medal",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3l-3 8h4l-1 10 8-12h-5l2-6H9z" />
      </svg>
    ),
  },
  {
    key: "leaderboard",
    label: "Leaderboard",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21v-7h4v7m2 0V8h4v13m2 0V3h4v18" />
      </svg>
    ),
  },
  {
    key: "golf-ball",
    label: "Golf Ball",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 9h.01M14 9h.01M12 13h.01" />
      </svg>
    ),
  },
  {
    key: "flag-checkered",
    label: "Checkered Flag",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 21V4m0 0l4-1 4 2 4-2 4 1v10l-4-1-4 2-4-2-4 1" />
      </svg>
    ),
  },
  {
    key: "cloud-sun",
    label: "Weather",
    category: "Golf",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h8a5 5 0 10-3.5-8.5A4 4 0 003 15z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8a3 3 0 00-3-3m5 1l1-1m-1 5h1.5M21 6h-1" />
      </svg>
    ),
  },

  // ── Contests & Games ──
  {
    key: "flag",
    label: "Flag / Cup",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
      </svg>
    ),
  },
  {
    key: "football",
    label: "Football",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "dice",
    label: "Games",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
      </svg>
    ),
  },
  {
    key: "ruler",
    label: "100 Feet",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 2L2 6l16 16 4-4L6 2zm2 8l2-2m1 5l2-2m1 5l2-2" />
      </svg>
    ),
  },
  {
    key: "puzzle",
    label: "Puzzle",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 4a2 2 0 114 0v1a1 1 0 001 1h3a1 1 0 011 1v3a1 1 0 01-1 1h-1a2 2 0 100 4h1a1 1 0 011 1v3a1 1 0 01-1 1h-3a1 1 0 01-1-1v-1a2 2 0 10-4 0v1a1 1 0 01-1 1H6a1 1 0 01-1-1v-3a1 1 0 00-1-1H3a2 2 0 110-4h1a1 1 0 001-1V7a1 1 0 011-1h3a1 1 0 001-1V4z" />
      </svg>
    ),
  },
  {
    key: "lightning-bolt",
    label: "Lightning",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    key: "scale",
    label: "Scale / Balance",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 6l3 6c0 1.657 1.343 2 3 2s3-.343 3-2L15 6m-12 0h12m-6 0V3m0 3v12m-4 3h8" />
      </svg>
    ),
  },
  {
    key: "crown",
    label: "Crown",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 8l4 12h12l4-12-5 4-5-8-5 8-5-4z" />
      </svg>
    ),
  },
  {
    key: "award",
    label: "Award",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="8" r="6" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" />
      </svg>
    ),
  },
  {
    key: "ticket",
    label: "Ticket",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 5v2m0 4v2m0 4v2M5 5a2 2 0 00-2 2v3a2 2 0 110 4v3a2 2 0 002 2h14a2 2 0 002-2v-3a2 2 0 110-4V7a2 2 0 00-2-2H5z" />
      </svg>
    ),
  },
  {
    key: "brackets",
    label: "Brackets",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v4h4M4 8h4v4M4 14v4h4M4 18h4v2M16 4h4v4M16 8h4v4M16 14h4v4M16 18h4v2M8 6h2v2H8zM8 16h2v2H8zM14 6h2v2h-2zM14 16h2v2h-2zM10 11h4v2h-4z" />
      </svg>
    ),
  },
  {
    key: "podium",
    label: "Podium",
    category: "Contests",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21h18M5 21v-6h4v6m2 0V9h4v12m2 0v-8h4v8" />
      </svg>
    ),
  },

  // ── Apparel & Personal ──
  {
    key: "shirt",
    label: "Shirt",
    category: "Apparel",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3L5 5l-2 4 3 1 1-2v13h10V8l1 2 3-1-2-4-4-2m-6 0c0 1.105.895 2 3 2s3-.895 3-2M9 3h6" />
      </svg>
    ),
  },
  {
    key: "hat",
    label: "Hat",
    category: "Apparel",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16h16M6 16c0-4 2.5-7 6-7s6 3 6 7M3 16c0 2 4 4 9 4s9-2 9-4" />
      </svg>
    ),
  },
  {
    key: "sunglasses",
    label: "Sunglasses",
    category: "Apparel",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 12c0-2 1.5-3 3.5-3h2C9 9 10 10 10 12s-1 3-2.5 3S5 14 5 12H2zm20 0c0-2-1.5-3-3.5-3h-2C15 9 14 10 14 12s1 3 2.5 3S19 14 19 12h3zm-12 0h4" />
      </svg>
    ),
  },
  {
    key: "shoe",
    label: "Shoe",
    category: "Apparel",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l2-8a2 2 0 012-2h2l2 4h7a3 3 0 013 3v1a2 2 0 01-2 2H4z" />
      </svg>
    ),
  },
  {
    key: "gloves",
    label: "Gloves",
    category: "Apparel",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 13V7a2 2 0 014 0v4m0-4V4a2 2 0 014 0v7m0-5V5a2 2 0 014 0v6m0 0v5a6 6 0 01-6 6H9a6 6 0 01-6-6v-3a2 2 0 014 0v0" />
      </svg>
    ),
  },
  {
    key: "backpack",
    label: "Backpack / Bag",
    category: "Apparel",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 3h6v3H9V3zM5 8a2 2 0 012-2h10a2 2 0 012 2v11a2 2 0 01-2 2H7a2 2 0 01-2-2V8zm4 4h6v3H9v-3z" />
      </svg>
    ),
  },

  // ── Sports ──
  {
    key: "basketball",
    label: "Basketball",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v18M3 12h18M5.6 5.6c2.4 2.8 6.4 2.8 6.4 6.4M18.4 5.6c-2.4 2.8-6.4 2.8-6.4 6.4" />
      </svg>
    ),
  },
  {
    key: "baseball",
    label: "Baseball",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 4c1 2 1 4 0 6s-1 4 0 6m10-12c-1 2-1 4 0 6s1 4 0 6" />
      </svg>
    ),
  },
  {
    key: "soccer",
    label: "Soccer",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 7l3 2v4l-3 2-3-2V9l3-2zm0-4v4m5.196 1L14 10m3.196 5L14 14m-2 5v-4m-5.196-1L10 14m-3.196-5L10 10" />
      </svg>
    ),
  },
  {
    key: "tennis",
    label: "Tennis",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 4c-4 4-4 12 0 16M6 4c4 4 4 12 0 16" />
      </svg>
    ),
  },
  {
    key: "swimming",
    label: "Swimming",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 18c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0M2 14c1.5-1 3-1 4.5 0s3 1 4.5 0 3-1 4.5 0 3 1 4.5 0" />
        <circle cx="16" cy="5" r="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 9l-4 2 3 3" />
      </svg>
    ),
  },
  {
    key: "bowling",
    label: "Bowling",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="10" cy="14" r="7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="8" cy="12" r="0.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="11" cy="11" r="0.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="10" cy="14" r="0.5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 3l1 5-3 1" />
      </svg>
    ),
  },
  {
    key: "darts",
    label: "Darts",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="9" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="5" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <circle cx="12" cy="12" r="1" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 6l3-3m0 0h-4m4 0v4" />
      </svg>
    ),
  },
  {
    key: "ping-pong",
    label: "Ping Pong",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <circle cx="17" cy="5" r="2" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 21l3-3m0 0a7 7 0 009.9-9.9L6 18z" />
      </svg>
    ),
  },

  {
    key: "football-american",
    label: "Football",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <ellipse cx="12" cy="12" rx="9" ry="5" transform="rotate(-45 12 12)" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 9l6 6m-6 0l2-2m2-2l2-2" />
      </svg>
    ),
  },
  {
    key: "football-helmet",
    label: "Football Helmet",
    category: "Sports",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3C7.029 3 3 7.029 3 12c0 2.21.895 4.21 2.343 5.657L7 16h4v3a9 9 0 005-1.343C18.21 16.21 21 13.314 21 10c0-3.866-4.029-7-9-7z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13h5m0-3h2" />
        <circle cx="9" cy="10" r="1" strokeWidth={1.5} />
      </svg>
    ),
  },

  // ── Health & Safety ──
  {
    key: "heart",
    label: "Heart",
    category: "Health & Safety",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
      </svg>
    ),
  },
  {
    key: "shield",
    label: "Shield",
    category: "Health & Safety",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>
    ),
  },
  {
    key: "first-aid",
    label: "First Aid",
    category: "Health & Safety",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V5zm8 3v8m-4-4h8" />
      </svg>
    ),
  },
  {
    key: "exclamation-triangle",
    label: "Warning",
    category: "Health & Safety",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
      </svg>
    ),
  },
  {
    key: "bandage",
    label: "Bandage",
    category: "Health & Safety",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a5 5 0 010 7.072L12 19.07l-6.364-6.364a5 5 0 017.072-7.07L12 4.929l-.707.707a5 5 0 017.07 0zM11 11h.01M13 11h.01M11 13h.01M13 13h.01" />
      </svg>
    ),
  },

  // ── Communication ──
  {
    key: "phone",
    label: "Phone",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    key: "envelope",
    label: "Email",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "chat-bubble",
    label: "Chat",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
  {
    key: "megaphone",
    label: "Announcement",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z" />
      </svg>
    ),
  },
  {
    key: "bell",
    label: "Notification",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
    ),
  },
  {
    key: "camera",
    label: "Camera",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
        <circle cx="12" cy="13" r="3" strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} />
      </svg>
    ),
  },
  {
    key: "video",
    label: "Video",
    category: "Communication",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
    ),
  },

  // ── Nature & Weather ──
  {
    key: "sun",
    label: "Sun",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
      </svg>
    ),
  },
  {
    key: "cloud",
    label: "Cloud",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 15a4 4 0 004 4h9a5 5 0 10-3.5-8.5A4 4 0 003 15z" />
      </svg>
    ),
  },
  {
    key: "rain",
    label: "Rain",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 13a4 4 0 004 4h9a5 5 0 10-3.5-8.5A4 4 0 003 13zm5 7l-1 2m5-2l-1 2m5-2l-1 2" />
      </svg>
    ),
  },
  {
    key: "snowflake",
    label: "Snowflake",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 2v20m0-20l4 4m-4-4L8 6m4 14l4-4m-4 4l-4-4M2 12h20m-20 0l4-4m-4 4l4 4m16-4l-4-4m4 4l-4 4" />
      </svg>
    ),
  },
  {
    key: "tree",
    label: "Tree",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 22v-6m0 0l-4-6h8l-4 6zm0-6l-3-5h6l-3 5zm0-5l-2-4h4l-2 4z" />
      </svg>
    ),
  },
  {
    key: "mountain",
    label: "Mountain",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 20l5.5-9 3 4 4-7L21 20H3z" />
      </svg>
    ),
  },
  {
    key: "wave",
    label: "Water / Wave",
    category: "Nature & Weather",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2 10c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 14c2-2 4-2 6 0s4 2 6 0 4-2 6 0M2 18c2-2 4-2 6 0s4 2 6 0 4-2 6 0" />
      </svg>
    ),
  },

  // ── Tools & Settings ──
  {
    key: "wrench",
    label: "Wrench",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
  {
    key: "cog",
    label: "Settings",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    key: "bolt",
    label: "Power",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    key: "lock",
    label: "Lock",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
      </svg>
    ),
  },
  {
    key: "unlock",
    label: "Unlock",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "filter",
    label: "Filter",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
      </svg>
    ),
  },
  {
    key: "clipboard",
    label: "Clipboard",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    key: "document",
    label: "Document",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "pen",
    label: "Pen / Edit",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    ),
  },
  {
    key: "scissors",
    label: "Scissors",
    category: "Tools & Settings",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.121 14.121L7.05 21.192m0-14.384l7.071 7.071m2.828-2.828L21.192 7.05M7.05 6.808a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm10.142 10.142a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243z" />
      </svg>
    ),
  },

  // ── Arrows & Symbols ──
  {
    key: "arrow-up",
    label: "Arrow Up",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 10l7-7m0 0l7 7m-7-7v18" />
      </svg>
    ),
  },
  {
    key: "arrow-down",
    label: "Arrow Down",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
      </svg>
    ),
  },
  {
    key: "arrow-right",
    label: "Arrow Right",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
      </svg>
    ),
  },
  {
    key: "arrow-left",
    label: "Arrow Left",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
      </svg>
    ),
  },
  {
    key: "refresh",
    label: "Refresh",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
      </svg>
    ),
  },
  {
    key: "external-link",
    label: "External Link",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    ),
  },
  {
    key: "plus-circle",
    label: "Plus Circle",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "minus-circle",
    label: "Minus Circle",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "x-circle",
    label: "X Circle",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "thumb-up",
    label: "Thumbs Up",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14 10h4.764a2 2 0 011.789 2.894l-3.5 7A2 2 0 0115.263 21h-4.017c-.163 0-.326-.02-.485-.06L7 20m7-10V5a2 2 0 00-2-2h-.095c-.5 0-.905.405-.905.905 0 .714-.211 1.412-.608 2.006L7 11v9m7-10h-2M7 20H5a2 2 0 01-2-2v-6a2 2 0 012-2h2.5" />
      </svg>
    ),
  },
  {
    key: "thumb-down",
    label: "Thumbs Down",
    category: "Arrows & Symbols",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 14H5.236a2 2 0 01-1.789-2.894l3.5-7A2 2 0 018.736 3h4.018c.163 0 .326.02.485.06L17 4m-7 10v5a2 2 0 002 2h.096c.5 0 .905-.405.905-.904 0-.715.211-1.413.608-2.008L17 13V4m-7 10h2M17 4h2a2 2 0 012 2v6a2 2 0 01-2 2h-2.5" />
      </svg>
    ),
  },

  // ── General ──
  {
    key: "calendar",
    label: "Calendar",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    key: "clock",
    label: "Clock",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "users",
    label: "Group",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
  },
  {
    key: "star",
    label: "Star",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
      </svg>
    ),
  },
  {
    key: "check-circle",
    label: "Checkmark",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "info",
    label: "Info",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "question",
    label: "Question",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    key: "hashtag",
    label: "Number",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
      </svg>
    ),
  },
  {
    key: "car",
    label: "Transportation",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 17h1m12 0h1M6 11l1.5-4.5A2 2 0 019.4 5h5.2a2 2 0 011.9 1.5L18 11M4 17v-3a2 2 0 012-2h12a2 2 0 012 2v3M4 17a2 2 0 002 2h1a2 2 0 002-2m8 0a2 2 0 002 2h1a2 2 0 002-2M9 17h6" />
      </svg>
    ),
  },
  {
    key: "gift",
    label: "Gift",
    category: "General",
    svg: (
      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
      </svg>
    ),
  },
];

// Lookup map for quick access
const ICON_MAP = new Map(OPTION_ICONS.map((i) => [i.key, i]));

// Get all unique categories in order
export const ICON_CATEGORIES = [...new Set(OPTION_ICONS.map((i) => i.category))];

// Get icon by key
export function getOptionIcon(key: string | null | undefined): IconDef | null {
  if (!key) return null;
  return ICON_MAP.get(key) || null;
}

// Render an icon by key at a given size class
export function OptionIcon({
  iconKey,
  className = "w-5 h-5",
}: {
  iconKey: string | null | undefined;
  className?: string;
}) {
  const icon = getOptionIcon(iconKey);
  if (!icon) return null;
  // The underlying <svg> has no intrinsic width/height (only a viewBox), so
  // sizing has to live on the SVG itself — wrapping it in a <span> with w-N/h-N
  // doesn't work because inline spans ignore width/height.
  if (!React.isValidElement(icon.svg)) return null;
  const svgEl = icon.svg as React.ReactElement<{ className?: string }>;
  const existingClass = svgEl.props.className ?? "";
  return React.cloneElement(svgEl, {
    className: `${existingClass} ${className}`.trim(),
  });
}
