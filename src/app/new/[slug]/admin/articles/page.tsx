import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2AdminClient } from "@/lib/v2/supabase";
import { hasPermission } from "@/lib/v2/permissions-server";
import ArticleManager from "@/components/v2/articles/ArticleManager";
import styles from "@/app/new/new.module.css";

/**
 * Group-admin Articles editor. Reachable by org owners/admins OR any member
 * granted the `manage_articles` permission (the "group feature admin" tier).
 */
export default async function AdminArticlesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const isAdmin = org.role === "owner" || org.role === "admin";
  if (!isAdmin) {
    const admin = v2AdminClient();
    if (!(await hasPermission(admin, ctx.userId, org.id, "manage_articles"))) {
      redirect(`/new/${slug}`);
    }
  }

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Administration
      </Link>
      <ArticleManager orgId={org.id} slug={slug} />
    </div>
  );
}
