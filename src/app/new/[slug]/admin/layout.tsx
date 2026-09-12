import Link from "next/link";
import { getPlatformContext } from "@/lib/v2/context";
import shell from "@/app/new/[slug]/(event)/event-shell.module.css";
/* eslint-disable @next/next/no-img-element */

/**
 * Admin section shell — a fixed top bar (group logo → group home, Home icon →
 * admin home) that mirrors the event-shell top bar. It sits at z-60 so drawers
 * and modals blur/cover the page BELOW it (never the nav), matching the rest of
 * the app. Individual admin pages handle their own access gating.
 */
export default async function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  const org = ctx?.orgs.find((o) => o.slug === slug) ?? null;
  const initial = (org?.name || slug).charAt(0).toUpperCase();

  return (
    <>
      <header className={shell.topbar}>
        <Link href={`/new/${slug}`} className={shell.topLogo} aria-label={`${org?.name || slug} home`}>
          {org?.logo_url ? (
            <img src={org.logo_url} alt="" />
          ) : (
            <span className={shell.topLogoMono}>{initial}</span>
          )}
        </Link>

        <Link href={`/new/${slug}/admin`} className={shell.iconBtn} aria-label="Admin home">
          <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <path d="M3 11l9-8 9 8" />
            <path d="M5 10v10a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1V10" />
          </svg>
        </Link>
      </header>

      <main style={{ paddingTop: 56 }}>{children}</main>
    </>
  );
}
