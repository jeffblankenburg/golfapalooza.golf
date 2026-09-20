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
import RoundsDrawer from "./RoundsDrawer";
import { useV2Music } from "./MusicProvider";
import FeatureIcon from "@/app/new/_components/FeatureIcon";
import type { NavFeature, LauncherGroup } from "@/lib/v2/features";
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
  pinned,
  launcher,
  musicEnabled,
  chatEnabled,
  photosEnabled,
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
  pinned: NavFeature[];
  launcher: LauncherGroup[];
  musicEnabled: boolean;
  chatEnabled: boolean;
  photosEnabled: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState<DrawerKey | null>(null);
  const [everythingOpen, setEverythingOpen] = useState(false);
  // The My Rounds "log a round" form: header +/× toggles it. Reset in `toggle`
  // (any drawer switch) so reopening My Rounds always lands on the list.
  const [roundsFormOpen, setRoundsFormOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnreadCount);
  const [chatUnread, setChatUnread] = useState(initialChatUnread);
  // A notification/activity deep-link target for a drawer (room or photo id),
  // consumed by ChatDrawer/PhotosDrawer on open, cleared when the drawer closes.
  const [deepLink, setDeepLink] = useState<{ room?: string; photo?: string; msg?: string; bulk?: string }>({});
  const music = useV2Music();

  // Publish the bottom-nav footprint globally while the shell is mounted, so the
  // (org-level) mini-player can sit directly above the nav and content/drawers
  // can reserve the combined chrome height. Cleared on unmount (e.g. the
  // full-screen scorer, which has no bottom nav → --nav-h falls back to 0).
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--nav-h", "calc(60px + env(safe-area-inset-bottom, 0px))");
    return () => {
      root.style.removeProperty("--nav-h");
    };
  }, []);

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
    setDeepLink((d) => (d.room || d.photo || d.msg || d.bulk ? {} : d));
    setEverythingOpen(false);
    setRoundsFormOpen(false);
    const willOpen = open !== k;
    // Closing chat: read receipts may have changed — refresh the badge.
    if (open === "chat" && k === "chat") refetchChatUnread();
    // Announce so the music overlay steps aside — one full-screen surface at a time.
    if (willOpen && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: k } }));
    }
    setOpen(willOpen ? k : null);
  };

  // Open/close the "Everything" launcher (bottom sheet), coordinating with the
  // drawers and the music overlay so only one full-screen surface shows at once.
  const openEverything = () => {
    setDeepLink((d) => (d.room || d.photo || d.msg || d.bulk ? {} : d));
    const willOpen = !everythingOpen;
    if (willOpen && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: "everything" } }));
    }
    setEverythingOpen(willOpen);
  };

  // Coordinate surfaces: opening the launcher closes any drawer; opening a drawer
  // (or expanding music) closes the launcher. Music also owns the shared drawers.
  useEffect(() => {
    const handler = (e: Event) => {
      const name = (e as CustomEvent<{ name?: string }>).detail?.name;
      if (!name) return;
      if (name === "everything") {
        setOpen(null);
      } else {
        setEverythingOpen(false);
        if (name === "music") setOpen(null);
      }
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
    const msg = p.get("msg") ?? undefined;
    window.history.replaceState(null, "", window.location.pathname);
    // Defer state changes out of the effect body (avoids cascading-render lint).
    const raf = requestAnimationFrame(() => {
      if (target === "music") {
        if (musicEnabled) music.expandDrawer();
      } else if (target === "chat" && !chatEnabled) {
        /* chat is off for this viewer */
      } else if (target === "photos" && !photosEnabled) {
        /* photos is off for this viewer */
      } else if (target in DRAWERS) {
        setDeepLink({ room, photo, msg });
        window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name: target } }));
        setOpen(target as DrawerKey);
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [music, musicEnabled, chatEnabled, photosEnabled]);

  // Open a drawer on request from elsewhere (an Activity-feed row or an in-app
  // notification tap). detail may carry a deep target (room/photo).
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ name?: string; room?: string; photo?: string; msg?: string; bulk?: string }>).detail;
      const name = detail?.name;
      if (name === "music") {
        if (musicEnabled) music.expandDrawer();
      } else if (name === "chat" && !chatEnabled) {
        /* off */
      } else if (name === "photos" && !photosEnabled) {
        /* off */
      } else if (name && name in DRAWERS) {
        if (detail?.room || detail?.photo || detail?.msg || detail?.bulk)
          setDeepLink({ room: detail.room, photo: detail.photo, msg: detail.msg, bulk: detail.bulk });
        window.dispatchEvent(new CustomEvent("ui:drawer-open", { detail: { name } }));
        setOpen(name as DrawerKey);
      }
    };
    window.addEventListener("ui:open-drawer", handler);
    return () => window.removeEventListener("ui:open-drawer", handler);
  }, [music, musicEnabled, chatEnabled, photosEnabled]);

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
          {chatEnabled && (
            <span className={styles.bellWrap}>
              <TopIcon label="Chat" active={open === "chat"} onClick={() => toggle("chat")}>
                <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </TopIcon>
              {chatUnread > 0 && (
                <span className={styles.bellBadge}>{chatUnread > 99 ? "99+" : chatUnread}</span>
              )}
            </span>
          )}
          {photosEnabled && (
            <TopIcon label="Photos" active={open === "photos"} onClick={() => toggle("photos")}>
              <path d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </TopIcon>
          )}
          {musicEnabled && (
            <TopIcon label="Music" active={music.isDrawerExpanded} onClick={() => music.toggleDrawer()}>
              <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
            </TopIcon>
          )}
          <TopIcon label="Rounds" active={open === "rounds"} onClick={() => toggle("rounds")}>
            <path d="M6 21V3" strokeLinecap="round" />
            <path d="M6 4h11l-2.5 3L17 10H6" />
            <circle cx="6" cy="21" r="1.4" />
          </TopIcon>
          <span className={styles.bellWrap}>
            <TopIcon label="Notifications" active={open === "notifications"} onClick={() => toggle("notifications")}>
              <path d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
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
          <div className={styles.drawerHeadLeft}>
            <span className={styles.drawerTitle}>{open ? DRAWERS[open].title : ""}</span>
            {open === "rounds" && (
              <button
                type="button"
                className={styles.drawerAddBtn}
                data-open={roundsFormOpen || undefined}
                onClick={() => setRoundsFormOpen((v) => !v)}
                aria-label={roundsFormOpen ? "Close" : "Log a round"}
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
            {open === "photos" && (
              <button
                type="button"
                className={styles.drawerAddBtn}
                onClick={() => window.dispatchEvent(new CustomEvent("ui:photos-add"))}
                aria-label="Add photos"
              >
                <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            )}
          </div>
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
            <ChatDrawer orgId={orgId} userId={userId} initialRoom={deepLink.room} initialMessageId={deepLink.msg} />
          ) : open === "photos" ? (
            <PhotosDrawer orgId={orgId} userId={userId} isAdmin={isAdmin} initialPhotoId={deepLink.photo} initialBulkId={deepLink.bulk} />
          ) : open === "rounds" ? (
            <RoundsDrawer
              active={open === "rounds"}
              orgId={orgId}
              viewerId={userId}
              formOpen={roundsFormOpen}
              onExitForm={() => setRoundsFormOpen(false)}
              onCloseDrawer={() => setOpen(null)}
            />
          ) : null}
        </div>
      </section>

      {/* ── "Everything" launcher (bottom sheet over content, below the bars) ── */}
      <div
        className={styles.backdrop}
        data-open={everythingOpen}
        onClick={() => setEverythingOpen(false)}
        aria-hidden
      />
      <section className={styles.drawer} data-open={everythingOpen} aria-hidden={!everythingOpen}>
        <div className={styles.drawerHead}>
          <span className={styles.drawerTitle}>Everything</span>
          <button type="button" className={styles.drawerClose} onClick={() => setEverythingOpen(false)} aria-label="Close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={styles.drawerBody}>
          {launcher.length === 0 ? (
            <p className={styles.drawerStub}>Nothing here yet — an admin can turn on features from the event settings.</p>
          ) : (
            launcher.map((group) => (
              <div key={group.bucketKey} className={styles.launchGroup}>
                <p className={styles.launchHead}>{group.bucketLabel}</p>
                <div className={styles.launchList}>
                  {group.features.map((f) => (
                    <LaunchItem key={f.key} feature={f} onNavigate={() => setEverythingOpen(false)} />
                  ))}
                </div>
              </div>
            ))
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
        {/* Admin-pinned features (≤3) from the event's feature registry. */}
        {pinned.map((f) =>
          f.active && f.href ? (
            <Link key={f.key} href={f.href} className={styles.navBtn}>
              <FeatureIcon name={f.icon} size={22} />
              {f.label}
            </Link>
          ) : (
            <button
              key={f.key}
              type="button"
              className={styles.navBtn}
              disabled
              aria-label={`${f.label}${f.lockReason ? ` (${f.lockReason})` : ""}`}
            >
              <FeatureIcon name={f.icon} size={22} />
              {f.label}
            </button>
          ),
        )}
        <button
          type="button"
          className={styles.navBtn}
          data-active={everythingOpen || undefined}
          onClick={openEverything}
          aria-label="Everything"
          aria-pressed={everythingOpen}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <rect x="4" y="4" width="6" height="6" rx="1.4" />
            <rect x="14" y="4" width="6" height="6" rx="1.4" />
            <rect x="4" y="14" width="6" height="6" rx="1.4" />
            <rect x="14" y="14" width="6" height="6" rx="1.4" />
          </svg>
          Everything
        </button>
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
      <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
        {children}
      </svg>
    </button>
  );
}

function LaunchItem({ feature, onNavigate }: { feature: NavFeature; onNavigate: () => void }) {
  const inner = (
    <>
      <span className={styles.launchIcon}>
        <FeatureIcon name={feature.icon} size={22} />
      </span>
      <span className={styles.launchText}>
        <span className={styles.launchLabel}>{feature.label}</span>
        <span className={styles.launchBlurb}>{feature.blurb}</span>
      </span>
      {feature.adminOnly && <span className={styles.launchLock}>Admins</span>}
      {feature.lockReason && <span className={styles.launchLock}>{feature.lockReason}</span>}
    </>
  );
  if (feature.active && feature.href) {
    return (
      <Link href={feature.href} className={styles.launchItem} onClick={onNavigate}>
        {inner}
      </Link>
    );
  }
  return (
    <div className={styles.launchItem} data-locked aria-disabled>
      {inner}
    </div>
  );
}
