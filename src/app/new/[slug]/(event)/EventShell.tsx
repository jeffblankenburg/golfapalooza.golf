"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { v2RealtimeClient } from "@/lib/v2/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { syncBadge } from "@/lib/v2/badge";
import { pushPermission, subscribeToV2Push } from "@/lib/v2/push-client";
import ProfileDrawer from "./ProfileDrawer";
import NotificationDrawer from "./NotificationDrawer";
import ChatDrawer from "./ChatDrawer";
import PhotosDrawer from "./PhotosDrawer";
import { useV2Music } from "./MusicProvider";
import styles from "./event-shell.module.css";
/* eslint-disable @next/next/no-img-element */

const CHAT_TYPES = ["chat_message", "chat_mention"];

// Music is NOT a shared-drawer key — it owns its own persistent overlay
// (mini-player + expandable) via MusicProvider so audio survives close/nav.
type DrawerKey = "chat" | "photos" | "rounds" | "profile" | "notifications";

const DRAWERS: Record<DrawerKey, { title: string; body: string }> = {
  chat: { title: "Chat", body: "Group chat will live here." },
  photos: { title: "Photos", body: "The photo gallery will live here." },
  rounds: { title: "My Rounds", body: "Round tracking & scoring will live here." },
  profile: { title: "Profile", body: "" },
  notifications: { title: "Notifications", body: "Your notifications will live here." },
};

/**
 * The event runtime shell (member app). Fixed top bar (function drawers) + fixed,
 * admin-configurable bottom nav. Per the hard rule, the bars sit ABOVE everything
 * (drawers slide over content but never over the bars) and never move.
 */
export default function EventShell({
  slug,
  orgId,
  userId,
  isAdmin,
  orgName,
  logoUrl,
  userAvatarUrl,
  initialUnreadCount,
  initialChatUnread,
  children,
}: {
  slug: string;
  orgId: string;
  userId: string;
  isAdmin: boolean;
  orgName: string;
  logoUrl: string | null;
  userAvatarUrl: string | null;
  initialUnreadCount: number;
  initialChatUnread: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<DrawerKey | null>(null);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [chatUnread, setChatUnread] = useState(initialChatUnread);
  // A notification/activity deep-link target for a drawer (room or photo id),
  // consumed by ChatDrawer/PhotosDrawer on open, cleared when the drawer closes.
  const [deepLink, setDeepLink] = useState<{ room?: string; photo?: string }>({});
  const music = useV2Music();

  const refetchChatUnread = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/chat/unread?orgId=${orgId}`);
      if (res.ok) setChatUnread((await res.json()).unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [orgId]);

  const toggle = (k: DrawerKey) => {
    // Opening notifications marks everything read (the drawer does the write).
    if (k === "notifications") setUnread(0);
    // Manual open is never a deep-link — drop any stale room/photo target so a
    // reopened drawer doesn't jump back to a previously deep-linked item.
    setDeepLink((d) => (d.room || d.photo ? {} : d));
    const willOpen = open !== k;
    // Closing chat: read receipts may have changed — refresh the badge.
    if (open === "chat" && k === "chat") refetchChatUnread();
    // Announce so the music overlay steps aside — one full-screen surface at a time.
    if (willOpen && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: k } }));
    }
    setOpen(willOpen ? k : null);
  };

  // When music expands (it broadcasts), close whatever shared drawer is open.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string }>).detail;
      if (detail?.name === "music") setOpen(null);
    };
    window.addEventListener("ui:drawer-open", handler);
    return () => window.removeEventListener("ui:drawer-open", handler);
  }, []);

  // Deep-link on arrival: a tapped notification/activity lands on the home route
  // with ?open=<drawer>&room=/photo=. Open that drawer to the target, then strip
  // the params so a refresh/back doesn't re-fire. Read from window.location (not
  // useSearchParams) to avoid a Suspense boundary requirement.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const target = p.get("open");
    if (!target) return;
    const room = p.get("room") ?? undefined;
    const photo = p.get("photo") ?? undefined;
    window.history.replaceState(null, "", window.location.pathname);
    // Defer state changes out of the effect body (avoids cascading-render lint).
    const raf = requestAnimationFrame(() => {
      if (target === "music") {
        music.expandDrawer();
      } else if (target in DRAWERS) {
        setDeepLink({ room, photo });
        window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: target } }));
        setOpen(target as DrawerKey);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [music]);

  // Open a drawer on request from elsewhere (an Activity-feed row or an in-app
  // notification tap). detail may carry a deep target (room/photo).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string; room?: string; photo?: string }>).detail;
      const name = detail?.name;
      if (name === "music") {
        music.expandDrawer();
      } else if (name && name in DRAWERS) {
        if (detail?.room || detail?.photo) setDeepLink({ room: detail.room, photo: detail.photo });
        window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name } }));
        setOpen(name as DrawerKey);
      }
    };
    window.addEventListener("ui:open-drawer", handler);
    return () => window.removeEventListener("ui:open-drawer", handler);
  }, [music]);

  // Refetch the authoritative unread count (used after read/delete events).
  const refetchUnread = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/notifications?orgId=${orgId}`);
      if (res.ok) setUnread((await res.json()).unread ?? 0);
    } catch {
      /* ignore */
    }
  }, [orgId]);

  // Live bell (mirrors the legacy HeaderBar): INSERT bumps the badge unless the
  // drawer is open (then it's read on arrival); UPDATE/DELETE recompute the count.
  useEffect(() => {
    let cancelled = false;
    let sb: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;
    let channel: RealtimeChannel | null = null;
    (async () => {
      sb = await v2RealtimeClient();
      if (cancelled) return;
      channel = sb
        .channel(`v2-notif-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "v2_notifications", filter: `user_id=eq.${userId}` },
          (payload) => {
            const n = payload.new as { org_id: string; type: string };
            if (n.org_id !== orgId || CHAT_TYPES.includes(n.type)) return;
            setOpen((cur) => {
              if (cur !== "notifications") setUnread((u) => u + 1);
              return cur;
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "v2_notifications", filter: `user_id=eq.${userId}` },
          () => refetchUnread(),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "v2_notifications", filter: `user_id=eq.${userId}` },
          () => refetchUnread(),
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [userId, orgId, refetchUnread]);

  // Keep the OS app-icon badge in sync with the unread count.
  useEffect(() => {
    syncBadge(unread);
  }, [unread]);

  // Auto-refresh the push subscription on mount if permission is already granted
  // (mirrors the legacy HeaderBar — keeps already-opted-in users subscribed).
  useEffect(() => {
    if (pushPermission() === "granted") subscribeToV2Push().catch(() => {});
  }, []);

  // Live chat badge: a new message in any of my rooms (RLS-scoped) bumps/refreshes
  // the top-nav chat count even when the drawer is closed.
  useEffect(() => {
    let cancelled = false;
    let sb: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;
    let channel: RealtimeChannel | null = null;
    (async () => {
      sb = await v2RealtimeClient();
      if (cancelled) return;
      channel = sb
        .channel(`v2-chat-badge-${userId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "v2_chat_messages" },
          (payload) => {
            const n = payload.new as { sender_id: string };
            if (n.sender_id === userId) return;
            setOpen((cur) => {
              if (cur !== "chat") refetchChatUnread();
              return cur;
            });
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [userId, refetchChatUnread]);

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────────────── */}
      <header className={styles.topbar}>
        <Link href={`/new/${slug}`} className={styles.topLogo} aria-label={orgName}>
          {logoUrl ? (
            <img src={logoUrl} alt="" />
          ) : (
            <span className={styles.topLogoMono}>{orgName.charAt(0).toUpperCase()}</span>
          )}
        </Link>

        <div className={styles.topGroup}>
          <span className={styles.bellWrap}>
            <TopIcon label="Chat" active={open === "chat"} onClick={() => toggle("chat")}>
              <path d="M8 10h8M8 14h5M21 12a8 8 0 01-11.5 7.2L3 21l1.8-6.5A8 8 0 1121 12z" />
            </TopIcon>
            {chatUnread > 0 && (
              <span className={styles.bellBadge}>{chatUnread > 99 ? "99+" : chatUnread}</span>
            )}
          </span>
          <TopIcon label="Photos" active={open === "photos"} onClick={() => toggle("photos")}>
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="8.5" cy="10" r="1.5" />
            <path d="M21 16l-5-5-9 8" />
          </TopIcon>
          <TopIcon label="Music" active={music.isDrawerExpanded} onClick={() => music.toggleDrawer()}>
            <path d="M9 18V6l10-2v12" />
            <circle cx="6" cy="18" r="3" />
            <circle cx="16" cy="16" r="3" />
          </TopIcon>
          <TopIcon label="Rounds" active={open === "rounds"} onClick={() => toggle("rounds")}>
            <path d="M6 21V3" strokeLinecap="round" />
            <path d="M6 4h11l-2.5 3L17 10H6" />
            <circle cx="6" cy="21" r="1.4" />
          </TopIcon>
          <span className={styles.bellWrap}>
            <TopIcon label="Notifications" active={open === "notifications"} onClick={() => toggle("notifications")}>
              <path d="M18 8a6 6 0 10-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 01-3.4 0" />
            </TopIcon>
            {unread > 0 && (
              <span className={styles.bellBadge}>{unread > 99 ? "99+" : unread}</span>
            )}
          </span>
          {userAvatarUrl ? (
            <button
              type="button"
              className={styles.iconBtn}
              data-active={open === "profile"}
              onClick={() => toggle("profile")}
              aria-label="Profile"
              aria-pressed={open === "profile"}
            >
              <img src={userAvatarUrl} alt="" className={styles.avatarIcon} />
            </button>
          ) : (
            <TopIcon label="Profile" active={open === "profile"} onClick={() => toggle("profile")}>
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21a8 8 0 0116 0" />
            </TopIcon>
          )}
        </div>
      </header>

      {/* ── Content (padded to clear both fixed bars) ───────────────────── */}
      <main className={styles.content}>{children}</main>

      {/* ── Drawer (slides over content, sits BELOW the bars) ───────────── */}
      <div className={styles.backdrop} data-open={open !== null} onClick={() => setOpen(null)} aria-hidden />
      <section className={styles.drawer} data-open={open !== null} aria-hidden={open === null}>
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>{open ? DRAWERS[open].title : ""}</span>
          <div className={styles.drawerHeadActions}>
            {open === "notifications" && (
              <button
                type="button"
                className={styles.drawerAction}
                onClick={() => window.dispatchEvent(new CustomEvent("ui:notif-settings"))}
                aria-label="Notification settings"
              >
                <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>
            )}
            <button type="button" className={styles.drawerClose} onClick={() => setOpen(null)} aria-label="Close">
              <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div className={styles.drawerBody} data-flush={open === "chat" || open === "photos" || undefined}>
          {open === "profile" ? (
            <ProfileDrawer active={open === "profile"} />
          ) : open === "notifications" ? (
            <NotificationDrawer
              active={open === "notifications"}
              orgId={orgId}
              onClose={() => setOpen(null)}
            />
          ) : open === "chat" ? (
            <ChatDrawer orgId={orgId} userId={userId} initialRoom={deepLink.room} />
          ) : open === "photos" ? (
            <PhotosDrawer orgId={orgId} userId={userId} isAdmin={isAdmin} initialPhotoId={deepLink.photo} />
          ) : (
            open && <p className={styles.drawerStub}>{DRAWERS[open].body}</p>
          )}
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
