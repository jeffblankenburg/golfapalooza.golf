"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./event-shell.module.css";

type DrawerKey = "chat" | "photos" | "music" | "rounds" | "profile" | "notifications";

const DRAWERS: Record<DrawerKey, { title: string; body: string }> = {
  chat: { title: "Chat", body: "Group chat will live here." },
  photos: { title: "Photos", body: "The photo gallery will live here." },
  music: { title: "Music", body: "The jukebox will live here." },
  rounds: { title: "My Rounds", body: "Round tracking & scoring will live here." },
  profile: { title: "Profile", body: "Your profile & groups will live here." },
  notifications: { title: "Notifications", body: "Your notifications will live here." },
};

/**
 * The event runtime shell (member app). Fixed top bar (function drawers) + fixed,
 * admin-configurable bottom nav. Per the hard rule, the bars sit ABOVE everything
 * (drawers slide over content but never over the bars) and never move.
 */
export default function EventShell({
  slug,
  isAdmin,
  children,
}: {
  slug: string;
  isAdmin: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<DrawerKey | null>(null);
  const toggle = (k: DrawerKey) => setOpen((cur) => (cur === k ? null : k));

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <div className={styles.topGroup}>
          <TopIcon label="Chat" active={open === "chat"} onClick={() => toggle("chat")}>
            <path d="M8 10h8M8 14h5M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" />
          </TopIcon>
          <TopIcon label="Photos" active={open === "photos"} onClick={() => toggle("photos")}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="M21 16l-5-5-9 8" />
          </TopIcon>
          <TopIcon label="Music" active={open === "music"} onClick={() => toggle("music")}>
            <path d="M9 18V6l10-2v12" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="16" cy="16" r="3" />
          </TopIcon>
          <TopIcon label="Rounds" active={open === "rounds"} onClick={() => toggle("rounds")}>
            <path d="M6 21V3" strokeLinecap="round" />
            <path d="M6 4h11l-2.5 3L17 10H6" />
            <circle cx="6" cy="21" r="1.4" />
          </TopIcon>
        </div>
        <div className={styles.topGroup}>
          <TopIcon label="Profile" active={open === "profile"} onClick={() => toggle("profile")}>
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21a8 8 0 0116 0" />
          </TopIcon>
          <TopIcon label="Notifications" active={open === "notifications"} onClick={() => toggle("notifications")}>
            <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
          </TopIcon>
        </div>
      </header>

      {/* ── Content (padded to clear both fixed bars) ───────────────────── */}
      <main className={styles.content}>{children}</main>

      {/* ── Drawer (slides over content, sits BELOW the bars) ───────────── */}
      <div className={styles.backdrop} data-open={open !== null} onClick={() => setOpen(null)} aria-hidden />
      <section className={styles.drawer} data-open={open !== null} aria-hidden={open === null}>
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>{open ? DRAWERS[open].title : ""}</span>
          <button type="button" className={styles.drawerClose} onClick={() => setOpen(null)} aria-label="Close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={styles.drawerBody}>
          {open && <p className={styles.drawerStub}>{DRAWERS[open].body}</p>}
        </div>
      </section>

      {/* ── Bottom nav (admin-configurable; gear pinned far right) ──────── */}
      <nav className={styles.bottomnav}>
        <Link href={`/new/${slug}`} className={styles.navBtn}>
          <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 11l9-8 9 8M5 10v10h14V10" />
          </svg>
          Home
        </Link>
        {/* Stub slots — the admin will pick these based on contests/activities. */}
        <NavStub label="Scores" />
        <NavStub label="Schedule" />
        <NavStub label="More" />
        {isAdmin && (
          <Link href={`/new/${slug}/admin`} className={`${styles.navBtn} ${styles.navGear}`}>
            <svg width="22" height="22" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.6} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            Admin
          </Link>
        )}
      </nav>
    </>
  );
}

function TopIcon({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={styles.iconBtn}
      data-active={active}
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
    >
      <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function NavStub({ label }: { label: string }) {
  return (
    <button type="button" className={styles.navBtn} disabled aria-label={`${label} (coming soon)`}>
      <span className={styles.navStubDot} aria-hidden />
      {label}
    </button>
  );
}
