import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { loadCostCategories } from "@/lib/v2/cost-categories";
import CostCategoriesManager from "./CostCategoriesManager";
import styles from "@/app/new/new.module.css";

/**
 * Platform data management → Cost categories (#216). System admins curate the shared
 * category list every group uses for manual cost items. Gated to system admins.
 */
export default async function CostCategoriesPage() {
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  if (!ctx.isSystemAdmin) redirect("/new");

  const admin = v2AdminClient();
  const categories = await loadCostCategories(admin, { includeInactive: true });

  return (
    <div className={styles.page}>
      <Link href="/new/admin" className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Platform
      </Link>
      <h1 className={styles.title}>Cost categories</h1>
      <p className={styles.lede} style={{ marginTop: 6 }}>
        The shared list every group uses to file manual cost items. Each has an emoji icon that shows in the picker. Deactivate a category to retire it without losing history.
      </p>

      <CostCategoriesManager initialCategories={categories} />
    </div>
  );
}
