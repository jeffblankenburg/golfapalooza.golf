"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { v2RealtimeClient } from "@/lib/v2/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { timeAgo } from "@/lib/v2/activity";
import { NOTIFICATION_SECTIONS, PUSH_MASTER_KEY } from "@/lib/v2/notification-prefs";
import { subscribeToV2Push } from "@/lib/v2/push-client";
import styles from "@/app/new/new.module.css";

const CHAT_TYPES = ["chat_message", "chat_mention"];

interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  data: { url?: string } | null;
  read: boolean;
  created_at: string;
}

/** Notifications drawer. On open: loads the list, marks all read, and (best-effort)
 *  registers the shared push subscription. Tapping an item deep-links via data.url. */
export default function NotificationDrawer({
  active,
  orgId,
  onClose,
}: {
  active: boolean;
  orgId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [items, setItems] = useState<Notif[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // The gear lives in the shell's drawer header (EventShell) and dispatches this.
  useEffect(() => {
    const openSettings = () => setShowSettings(true);
    window.addEventListener("ui:notif-settings", openSettings);
    return () => window.removeEventListener("ui:notif-settings", openSettings);
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v2/notifications?orgId=${orgId}`);
      const d = res.ok ? await res.json() : { notifications: [] };
      setItems(d.notifications || []);
    } catch {
      /* ignore */
    } finally {
      setLoaded(true);
    }
  }, [orgId]);

  useEffect(() => {
    if (!active) return;
    load();
    // Mark everything read + register for push (both best-effort, gesture = open).
    fetch("/api/v2/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, markAll: true }),
    }).catch(() => {});
    subscribeToV2Push().catch(() => {});
  }, [active, orgId, load]);

  // Live list: new notifications appear while the drawer is open (and are marked
  // read on arrival, since the user is looking at them). Mirrors the legacy drawer.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let sb: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;
    let channel: RealtimeChannel | null = null;
    (async () => {
      sb = await v2RealtimeClient();
      if (cancelled) return;
      channel = sb
        .channel("v2-notif-drawer")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "v2_notifications" },
          (payload) => {
            const n = payload.new as Notif & { org_id: string };
            if (n.org_id !== orgId || CHAT_TYPES.includes(n.type)) return;
            setItems((cur) =>
              cur.some((x) => x.id === n.id) ? cur : [{ ...n, read: true }, ...cur],
            );
            fetch("/api/v2/notifications", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ orgId, ids: [n.id] }),
            }).catch(() => {});
          },
        )
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [active, orgId]);

  function open(n: Notif) {
    if (!n.data?.url) return;
    // In-app: if the URL targets a drawer (?open=…), open it directly (no nav) so
    // it works while already on the home route; otherwise navigate. The push path
    // (service worker) uses the same URL to cold-load and open the drawer.
    const u = new URL(n.data.url, window.location.origin);
    const target = u.searchParams.get("open");
    if (target) {
      window.dispatchEvent(
        new CustomEvent("ui:open-drawer", {
          detail: {
            name: target,
            room: u.searchParams.get("room") ?? undefined,
            photo: u.searchParams.get("photo") ?? undefined,
            msg: u.searchParams.get("msg") ?? undefined,
          },
        }),
      );
    } else {
      router.push(n.data.url);
    }
    onClose();
  }

  async function remove(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setItems((cur) => cur.filter((n) => n.id !== id));
    fetch("/api/v2/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, ids: [id] }),
    }).catch(() => {});
  }

  async function clearAll() {
    setItems([]);
    fetch("/api/v2/notifications", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, all: true }),
    }).catch(() => {});
  }

  const settings = showSettings ? (
    <NotifSettingsModal orgId={orgId} onClose={() => setShowSettings(false)} />
  ) : null;

  let content: React.ReactNode;
  if (!loaded) {
    content = <p className={styles.drawerStub}>Loading…</p>;
  } else if (items.length === 0) {
    content = <p className={styles.drawerStub}>You&apos;re all caught up.</p>;
  } else {
    content = (
      <div className={styles.notifList}>
        <button type="button" className={styles.notifClear} onClick={clearAll}>
          Clear all
        </button>
        {items.map((n) => (
          <div
            key={n.id}
            className={styles.notifRow}
            data-unread={!n.read || undefined}
            data-clickable={!!n.data?.url || undefined}
            onClick={() => open(n)}
          >
            <span className={styles.notifDot} data-type={n.type} aria-hidden />
            <span className={styles.notifText}>
              <span className={styles.notifTitle}>{n.title}</span>
              {n.body && <span className={styles.notifBody}>{n.body}</span>}
              <span className={styles.notifTime}>{timeAgo(n.created_at)}</span>
            </span>
            <button
              type="button"
              className={styles.notifDelete}
              onClick={(e) => remove(n.id, e)}
              aria-label="Dismiss"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      {content}
      {settings}
    </>
  );
}

/** Modal (launched from the drawer-header gear) to toggle notification
 *  categories. Opt-out: everything defaults on. Toggles save immediately. */
function NotifSettingsModal({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch(`/api/v2/notifications/prefs?orgId=${orgId}`);
      const d = res.ok ? await res.json() : { prefs: {} };
      if (!cancelled) setPrefs(d.prefs || {});
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function toggle(key: string, next: boolean) {
    setPrefs((p) => ({ ...(p || {}), [key]: next }));
    fetch("/api/v2/notifications/prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orgId, category: key, enabled: next }),
    }).catch(() => {});
  }

  if (typeof document === "undefined") return null;
  // Portal into the /new theme root (.wrap) — NOT document.body — so the org
  // CSS variables (--card/--ink/--brand/--line) resolve. body is outside that
  // scope, which would render the card transparent and hide the toggle tracks.
  const host = document.querySelector<HTMLElement>(`.${styles.wrap}`) ?? document.body;

  return createPortal(
    <div className={styles.notifSettingsBackdrop} onClick={onClose}>
      <div className={styles.notifSettingsCard} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className={styles.notifSettingsHead}>
          <span className={styles.notifSettingsTitle}>Notification Settings</span>
          <button type="button" className={styles.notifSettingsClose} onClick={onClose} aria-label="Close">
            <svg width="20" height="20" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <p className={styles.notifSettingsIntro}>
          Choose what you&apos;re notified about. Turning a type off hides it everywhere; turning off
          Push notifications keeps everything in-app only.
        </p>
        {prefs === null ? (
          <p className={styles.notifSettingsLoading}>Loading…</p>
        ) : (
          <div className={styles.notifSettingsList}>
            {/* Master push toggle */}
            <div className={styles.notifSettingRow}>
              <span className={styles.notifSettingText}>
                <span className={styles.notifSettingLabel}>Push notifications</span>
                <span className={styles.notifSettingDesc}>Also buzz this device. Off = in-app only.</span>
              </span>
              <Switch on={prefs[PUSH_MASTER_KEY] ?? true} label="Push notifications" onToggle={(v) => toggle(PUSH_MASTER_KEY, v)} />
            </div>

            {NOTIFICATION_SECTIONS.map((section) => (
              <div key={section.key} className={styles.notifSettingsSection}>
                <p className={styles.notifSettingsSectionLabel}>{section.label}</p>
                {section.items.map((item) => {
                  const on = prefs[item.type] ?? true;
                  return (
                    <div key={item.type} className={styles.notifSettingRow}>
                      <span className={styles.notifSettingText}>
                        <span className={styles.notifSettingLabel}>{item.label}</span>
                        <span className={styles.notifSettingDesc}>{item.description}</span>
                      </span>
                      <Switch on={on} label={item.label} onToggle={(v) => toggle(item.type, v)} />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>,
    host,
  );
}

/** Small on/off switch used throughout the settings modal. */
function Switch({ on, label, onToggle }: { on: boolean; label: string; onToggle: (next: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={styles.notifSwitch}
      data-on={on || undefined}
      onClick={() => onToggle(!on)}
    >
      <span className={styles.notifSwitchKnob} />
    </button>
  );
}
