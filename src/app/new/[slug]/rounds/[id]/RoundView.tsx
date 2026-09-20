"use client";

import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import RoundDetail from "@/app/new/[slug]/(event)/RoundDetail";

/**
 * Standalone round view — a read-only scorecard + comments, reachable by any
 * member of the round's group (notably non-players who were @mentioned or are
 * following). Reuses RoundDetail; comments auto-open when a notification
 * deep-links here (?c=1).
 */
export default function RoundView({
  slug,
  roundId,
  orgId,
  viewerId,
  autoOpenComments,
}: {
  slug: string;
  roundId: string;
  orgId: string;
  viewerId: string;
  autoOpenComments: boolean;
}) {
  const router = useRouter();
  return (
    <div className={styles.roundPage}>
      <header className={styles.roundPageHeader}>
        <button type="button" className={styles.roundPageBack} onClick={() => router.push(`/new/${slug}`)} aria-label="Back">
          <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        <span className={styles.roundPageTitle}>Round</span>
      </header>
      <div className={styles.roundPageBody}>
        <RoundDetail
          id={roundId}
          orgId={orgId}
          viewerId={viewerId}
          defaultCommentsOpen={autoOpenComments}
          onResume={() => router.push(`/new/${slug}/rounds/${roundId}/score`)}
          onDeleted={() => router.push(`/new/${slug}`)}
        />
      </div>
    </div>
  );
}
