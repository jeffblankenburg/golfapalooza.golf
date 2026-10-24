import Link from "next/link";
import type { ReactNode } from "react";
import { contestTypeLabel } from "@/lib/v2/contests";
import styles from "./ContestCard.module.css";

/** Re-exported so per-type body renderers (game tables, side rows) share the exact
 *  same classes as the shell. */
export { styles as cardStyles };

type IconKind = "squares" | "pickem" | "calcutta" | "cornhole" | "other" | "golf";

/** Golf-round contests all share the flag glyph; the label text disambiguates them. */
function iconKindFor(kind: string): IconKind {
  if (kind === "squares" || kind === "pickem" || kind === "calcutta" || kind === "cornhole") return kind;
  if (kind === "other") return "other";
  return "golf"; // scramble, ryder_cup, skins, ctp, long_drive, long_putt, bspitw, hundred_feet
}

/** The glyph for a contest type — shared by the list badge and the add menus. */
export function ContestTypeIcon({ kind, size = 13 }: { kind: string; size?: number }) {
  switch (iconKindFor(kind)) {
    case "squares":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
        </svg>
      );
    case "pickem":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" stroke="currentColor" strokeWidth={2} />
          <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "calcutta":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 21h18M6 21V10M18 21V10M4 10h16L12 3 4 10z" />
        </svg>
      );
    case "cornhole":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
          <circle cx="12" cy="12" r="9" />
          <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none" />
        </svg>
      );
    case "other":
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <path d="M12 2l2.6 6.3L21 9l-5 4.3L17.5 20 12 16.5 6.5 20 8 13.3 3 9l6.4-.7L12 2z" />
        </svg>
      );
    default: // golf
      return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M6 21V4l10 3-10 3" />
          <path d="M6 21h5" />
        </svg>
      );
  }
}

/** Contest-type badge — glyph + label, matching the home-page type tags. */
export function ContestTypeTag({ kind, label }: { kind: string; label?: string }) {
  return (
    <span className={styles.typeTag}>
      <ContestTypeIcon kind={kind} />
      {label ?? contestTypeLabel(kind)}
    </span>
  );
}

const GEAR_PATH =
  "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z";

/**
 * The shared contest card shell: a type tag + name + meta + count that toggles an
 * accordion body, plus a stacked action column (gear over a detail caret). Carries
 * no contest-type logic — callers pass the meta/count strings, the gear handler, and
 * the body as children. Used by both the group and event admin lanes.
 */
export default function ContestCard({
  kind,
  tagLabel,
  name,
  meta,
  count,
  detailHref,
  detailLabel = "Open details",
  gearLabel = "Quick settings",
  onGear,
  isOpen,
  onToggle,
  badge,
  rightStat,
  children,
}: {
  kind: string;
  tagLabel?: string;
  name: string;
  meta: ReactNode;
  count?: ReactNode;
  detailHref?: string;
  detailLabel?: string;
  gearLabel?: string;
  onGear?: () => void;
  isOpen: boolean;
  onToggle: () => void;
  badge?: ReactNode; // e.g. a "Needs attention" flag beside the name
  rightStat?: ReactNode; // right-aligned value column (e.g. player count, under a header)
  children?: ReactNode; // accordion body
}) {
  return (
    <div className={styles.rowWrap} data-open={isOpen || undefined}>
      <div className={styles.rowHead}>
        <button type="button" className={styles.rowMain} onClick={onToggle} aria-expanded={isOpen}>
          <span className={styles.rowHeadText}>
            <ContestTypeTag kind={kind} label={tagLabel} />
            <span className={styles.rowName}>{name}{badge}</span>
            <span className={styles.rowMeta}>{meta}</span>
            {count != null && <span className={styles.rowCount}>{count}</span>}
          </span>
          {rightStat != null && <span className={styles.rowStat}>{rightStat}</span>}
          <svg className={styles.rowChev} data-open={isOpen || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        {(onGear || detailHref) && (
          <div className={styles.rowActions}>
            {onGear && (
              <button type="button" onClick={onGear} aria-label={gearLabel} title={gearLabel}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d={GEAR_PATH} />
                </svg>
              </button>
            )}
            {detailHref && (
              <Link href={detailHref} aria-label={detailLabel} title={detailLabel}>
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
              </Link>
            )}
          </div>
        )}
      </div>
      {isOpen && <div className={styles.rowBody}>{children}</div>}
    </div>
  );
}

/** A 3-column game/row table for accordion bodies (when, label, pay). Cells are
 *  ReactNode so callers control formatting (bold winners, badges, etc.). */
export function CardGameTable({ rows, empty }: { rows: { key: string; when: ReactNode; game: ReactNode; pay: ReactNode }[]; empty: string }) {
  if (rows.length === 0) return <p className={styles.rowEmpty}>{empty}</p>;
  return (
    <table className={styles.gameTable}>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className={styles.gtWhen}>{r.when}</td>
            <td className={styles.gtGame}>{r.game}</td>
            <td className={styles.gtPay}>{r.pay}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
