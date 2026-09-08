import Link from "next/link";
import styles from "../new.module.css";

export interface AdminItem {
  label: string;
  desc?: string;
  href?: string; // present = built (a link); absent = stub ("Soon")
}

/**
 * A grid of admin areas. Items with an href are live links; items without are
 * stubs badged "Soon" — used to lay out the full group/event admin IA before the
 * individual tools are built.
 */
export default function AdminGrid({ items }: { items: AdminItem[] }) {
  return (
    <div className={styles.adminGrid}>
      {items.map((it) =>
        it.href ? (
          <Link key={it.label} href={it.href} className={styles.adminTile}>
            <span className={styles.adminTileLabel}>{it.label}</span>
            {it.desc && <span className={styles.adminTileDesc}>{it.desc}</span>}
          </Link>
        ) : (
          <div key={it.label} className={`${styles.adminTile} ${styles.adminTileStub}`}>
            <span className={styles.adminTileLabel}>{it.label}</span>
            {it.desc && <span className={styles.adminTileDesc}>{it.desc}</span>}
            <span className={styles.soonBadge}>Soon</span>
          </div>
        )
      )}
    </div>
  );
}
