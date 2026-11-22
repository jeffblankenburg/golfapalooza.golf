import Link from "next/link";
import type { ReactNode } from "react";
import styles from "../new.module.css";

export interface AdminItem {
  label: string;
  desc?: string;
  href?: string; // present = built (a link); absent = stub ("Soon")
  control?: ReactNode; // optional inline control (e.g. a feature visibility toggle)
}

/**
 * A grid of admin areas. Items with an href are live links; items without are
 * stubs badged "Soon". An item may also carry a `control` (e.g. a member-visibility
 * toggle) rendered below the link, outside its clickable area.
 */
export default function AdminGrid({ items }: { items: AdminItem[] }) {
  return (
    <div className={styles.adminGrid}>
      {items.map((it) => {
        const body = (
          <>
            <span className={styles.adminTileLabel}>{it.label}</span>
            {it.desc && <span className={styles.adminTileDesc}>{it.desc}</span>}
          </>
        );

        // With a control, the tile is a container: a link (or plain body) + the control.
        if (it.control) {
          return (
            <div key={it.label} className={`${styles.adminTile} ${styles.adminTileRow}`}>
              {it.href ? (
                <Link href={it.href} className={styles.adminTileBody}>{body}</Link>
              ) : (
                <span className={styles.adminTileBody}>{body}</span>
              )}
              {it.control}
            </div>
          );
        }

        return it.href ? (
          <Link key={it.label} href={it.href} className={styles.adminTile}>{body}</Link>
        ) : (
          <div key={it.label} className={`${styles.adminTile} ${styles.adminTileStub}`}>
            {body}
            <span className={styles.soonBadge}>Soon</span>
          </div>
        );
      })}
    </div>
  );
}
