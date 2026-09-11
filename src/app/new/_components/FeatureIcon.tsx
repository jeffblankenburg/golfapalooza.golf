/**
 * Shared inline-SVG icon set for the feature catalog (src/lib/v2/features.ts).
 * Keyed by the `icon` string on each FeatureDef so the config screen and the
 * "Everything" launcher render the same glyph. Falls back to a dot for any
 * unmapped key. Pure component — safe in server or client trees.
 */

const PATHS: Record<string, React.ReactNode> = {
  flag: <><path d="M6 21V3" /><path d="M6 4h11l-2.5 3L17 10H6" /></>,
  users: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M16 6a3 3 0 010 6M18 20a6 6 0 00-3-5.2" /></>,
  coins: <><ellipse cx="9" cy="7" rx="6" ry="3" /><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7" /><path d="M15 12.5c2.5.4 6 .4 6-2.5 0-1.7-2.7-3-6-3" /><path d="M15 17c3.3 0 6-1.3 6-3" /></>,
  target: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="4" /><circle cx="12" cy="12" r="1" /></>,
  dice: <><rect x="4" y="4" width="16" height="16" rx="3" /><circle cx="9" cy="9" r="1" /><circle cx="15" cy="15" r="1" /><circle cx="15" cy="9" r="1" /><circle cx="9" cy="15" r="1" /></>,
  trophy: <><path d="M8 4h8v5a4 4 0 01-8 0V4z" /><path d="M8 6H5v1a3 3 0 003 3M16 6h3v1a3 3 0 01-3 3" /><path d="M12 13v4M9 20h6M10 20v-3h4v3" /></>,
  gavel: <><path d="M14 4l6 6-3 3-6-6z" /><path d="M11 7l-7 7 3 3 7-7" /><path d="M3 21h8" /></>,
  bracket: <><path d="M4 5v14M4 8h5M4 16h5M9 12h5M14 5v14M14 12h6" /></>,
  check: <><path d="M20 6L9 17l-5-5" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  map: <><path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" /><path d="M9 4v14M15 6v14" /></>,
  bed: <><path d="M3 8v11M3 13h18v6M21 19v-4a3 3 0 00-3-3H9v3" /><circle cx="6.5" cy="10.5" r="1.5" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>,
  shirt: <><path d="M8 4l-5 3 2 4 2-1v9h10v-9l2 1 2-4-5-3-2 2-2-2z" /></>,
  list: <><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></>,
  chat: <><path d="M8 10h8M8 14h5M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" /></>,
  image: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="8.5" cy="10" r="1.5" /><path d="M21 16l-5-5-9 8" /></>,
  music: <><path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" /></>,
  book: <><path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z" /><path d="M4 19a2 2 0 012-2h13" /></>,
  userPlus: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0112 0" /><path d="M17 8v6M14 11h6" /></>,
  news: <><path d="M4 5h13v14H4z" /><path d="M17 8h3v9a2 2 0 01-2 2h-1" /><path d="M7 9h7M7 13h7M7 17h4" /></>,
  poll: <><path d="M4 20V10M10 20V4M16 20v-7M22 20H2" /></>,
  medal: <><circle cx="12" cy="14" r="5" /><path d="M12 12v2l1.5 1M9 4l2 5M15 4l-2 5" /></>,
  quote: <><path d="M7 7h4v4c0 3-2 5-4 5V7zM15 7h4v4c0 3-2 5-4 5V7z" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0116 0" /></>,
  wallet: <><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18M17 14h.01" /></>,
};

export default function FeatureIcon({
  name,
  size = 20,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name] ?? <circle cx="12" cy="12" r="3" />}
    </svg>
  );
}
