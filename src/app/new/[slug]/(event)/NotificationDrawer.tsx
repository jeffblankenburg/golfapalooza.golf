"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { v2BrowserClient } from "@/lib/v2/supabase-browser";
import { timeAgo } from "@/lib/v2/activity";
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
    const supabase = v2BrowserClient();
    const channel = supabase
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [active, orgId]);

  function open(n: Notif) {
    if (n.data?.url) {
      router.push(n.data.url);
      onClose();
    }
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

  if (!loaded) return <p className={styles.drawerStub}>Loading…</p>;
  if (items.length === 0) {
    return <p className={styles.drawerStub}>You&apos;re all caught up.</p>;
  }

  return (
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
