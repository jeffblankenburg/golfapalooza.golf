import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { loadScoringMetrics } from "@/lib/v2/scoring-metrics";
import ScoringMetricsManager from "./ScoringMetricsManager";
import styles from "@/app/new/new.module.css";

/**
 * Platform data management → Scoring metrics (#220). System admins curate the shared
 * catalog of per-player scoring observations (greens hit, holed out, distance, ...).
 * Group admins pick which a consuming contest (BSPITW / 100 Feet / CTP) collects.
 * Gated to system admins.
 */
export default async function ScoringMetricsPage() {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  if (!ctx.isSystemAdmin) redirect("/new");

  const admin = v2AdminClient();
  const metrics = await loadScoringMetrics(admin, { includeInactive: true });

  return (
    <div className={styles.page}>
      <Link href="/new/admin" className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Platform
      </Link>
      <h1 className={styles.title}>Scoring metrics</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        The shared catalog of per-player observations a scramble scorer can collect. Group admins pick which metrics a contest (like BSPITW or 100 Feet) uses, so write a clear description. Deactivate a metric to retire it without losing history.
      </p>

      <ScoringMetricsManager initialMetrics={metrics} />
    </div>
  );
}
