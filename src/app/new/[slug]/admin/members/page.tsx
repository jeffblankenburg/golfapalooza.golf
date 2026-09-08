import Link from "next/link";
import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import styles from "@/app/new/new.module.css";
import MembersManager from "./MembersManager";

export default async function MembersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");

  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");
  if (org.role !== "owner" && org.role !== "admin") redirect(`/new/${slug}`);

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin`} className={styles.back}>
        <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>
      <p className={styles.eyebrow}>{org.name}</p>
      <MembersManager
        orgId={org.id}
        currentUserId={ctx.userId}
        currentRole={org.role}
      />
    </div>
  );
}
