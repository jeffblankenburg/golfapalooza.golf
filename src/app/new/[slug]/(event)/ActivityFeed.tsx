import Link from "next/link";
import { timeAgo, type ActivityRow } from "@/lib/v2/activity";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

/** Per-kind glyph for the leading badge when an item has no image. */
function KindIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    round: <path d="M6 21V3M6 4h11l-2.5 3L17 10H6" />,
    photo: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 16l-5-5-9 8" />
      </>
    ),
    song: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    article: <path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" />,
    announcement: <path d="M3 11l14-6v14L3 13zM3 11v2M17 8a3 3 0 010 6" />,
  };
  return (
    <span className={styles.feedIcon} data-kind={kind} aria-hidden>
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        {paths[kind] ?? <circle cx="12" cy="12" r="8" />}
      </svg>
    </span>
  );
}

/** Home activity feed. Renders nothing until there's activity (forward-only log). */
export default function ActivityFeed({ items }: { items: ActivityRow[] }) {
  if (items.length === 0) return null;

  return (
    <section className={styles.module}>
      <p className={styles.sectionLabel}>Activity</p>
      <div className={styles.feedList}>
        {items.map((it) => {
          const row = (
            <>
              {it.image_url ? (
                <img className={styles.feedThumb} src={it.image_url} alt="" />
              ) : it.actor?.avatar_url ? (
                <img className={styles.feedThumb} src={it.actor.avatar_url} alt="" />
              ) : (
                <KindIcon kind={it.kind} />
              )}
              <span className={styles.feedText}>
                <span className={styles.feedTitle}>{it.title}</span>
                {it.subtitle && <span className={styles.feedSub}>{it.subtitle}</span>}
                <span className={styles.feedMeta}>
                  {it.actor?.display_name ? `${it.actor.display_name}, ` : ""}
                  {timeAgo(it.created_at)}
                </span>
              </span>
            </>
          );
          return it.link ? (
            <Link key={it.id} href={it.link} className={styles.feedRow}>
              {row}
            </Link>
          ) : (
            <div key={it.id} className={styles.feedRow}>
              {row}
            </div>
          );
        })}
      </div>
    </section>
  );
}
