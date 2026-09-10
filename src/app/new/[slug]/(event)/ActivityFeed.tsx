"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { v2BrowserClient, v2RealtimeClient } from "@/lib/v2/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { timeAgo, type ActivityRow } from "@/lib/v2/activity";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

const FEED_LIMIT = 15;
const SELECT =
  "id, kind, title, subtitle, image_url, link, created_at, metadata, actor:v2_profiles(display_name, avatar_url)";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
function initial(name: string | undefined | null) {
  return (name?.trim()[0] || "?").toUpperCase();
}
function toParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`; // proper minus sign
}

/** Per-kind glyph for the leading badge when there's no image or avatar. */
function KindIcon({ kind }: { kind: string }) {
  const paths: Record<string, React.ReactNode> = {
    round: <path d="M6 21V3M6 4h11l-2.5 3L17 10H6" />,
    photo: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <circle cx="8.5" cy="10" r="1.5" />
        <path d="M21 16l-5-5-9 8" />
      </>
    ),
    song: (
      <>
        <path d="M9 18V6l10-2v12" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    article: <path d="M6 3h9l3 3v15H6zM14 3v4h4M9 12h6M9 16h6" />,
    announcement: <path d="M3 11l14-6v14L3 13zM3 11v2M17 8a3 3 0 010 6" />,
    rsvp: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />,
  };
  return (
    <span className={styles.feedIcon} data-kind={kind} aria-hidden>
      <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
        {paths[kind] ?? <circle cx="12" cy="12" r="8" />}
      </svg>
    </span>
  );
}

/** The leading visual: a photo/art thumbnail (square) when the item has an image,
 *  otherwise the actor's circular avatar, otherwise a kind glyph. */
function Leading({ it }: { it: ActivityRow }) {
  const thumb = it.kind !== "rsvp" ? it.image_url : null;
  if (thumb) return <img className={styles.feedThumb} src={thumb} alt="" />;
  if (it.actor?.avatar_url) return <img className={styles.feedAvatar} src={it.actor.avatar_url} alt="" />;
  if (it.actor) return <span className={styles.feedAvatarFallback}>{initial(it.actor.display_name)}</span>;
  return <KindIcon kind={it.kind} />;
}

/** Right-aligned accessory. Rounds show score + strokes to par. */
function Accessory({ it }: { it: ActivityRow }) {
  if (it.kind === "round") {
    const score = num(it.metadata?.score);
    const toPar = num(it.metadata?.toPar);
    if (score === null && toPar === null) return null;
    return (
      <span className={styles.feedScore}>
        {score !== null && <span className={styles.feedScoreNum}>{score}</span>}
        {toPar !== null && (
          <span className={styles.feedToPar} data-sign={toPar < 0 ? "under" : toPar > 0 ? "over" : "even"}>
            {toParLabel(toPar)}
          </span>
        )}
      </span>
    );
  }
  return null;
}

/** The body: actor name, the kind-specific action/status line, timestamp. */
function Body({ it }: { it: ActivityRow }) {
  const likelihood = it.kind === "rsvp" ? num(it.metadata?.likelihood) : null;
  return (
    <span className={styles.feedMain}>
      {it.actor?.display_name ? (
        <>
          <span className={styles.feedName}>{it.actor.display_name}</span>
          <span className={styles.feedAction}>
            {likelihood !== null && (
              <span className={styles.feedActionDot} data-likelihood={likelihood} aria-hidden />
            )}
            {it.title}
          </span>
        </>
      ) : (
        // No actor (system event): title becomes the primary line.
        <span className={styles.feedName}>{it.title}</span>
      )}
      {it.subtitle && <span className={styles.feedActionSub}>{it.subtitle}</span>}
      <span className={styles.feedTime}>{timeAgo(it.created_at)}</span>
    </span>
  );
}

/**
 * Home activity feed. Seeds from server-fetched rows, then subscribes to
 * v2_activity INSERTs (with an authed realtime socket) and refetches the top
 * slice so events appear live. Renders a per-kind template for each row and
 * links to the item's source (rounds/articles via `link`; photos/songs open the
 * relevant drawer). RSVP rows are intentionally not links.
 */
export default function ActivityFeed({
  initialItems,
  orgId,
}: {
  initialItems: ActivityRow[];
  orgId: string;
}) {
  const [items, setItems] = useState<ActivityRow[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    let sb: Awaited<ReturnType<typeof v2RealtimeClient>> | null = null;
    let channel: RealtimeChannel | null = null;

    const refresh = async () => {
      const { data } = await v2BrowserClient()
        .from("v2_activity")
        .select(SELECT)
        .eq("org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(FEED_LIMIT);
      if (cancelled) return;
      const rows = ((data as unknown as (Omit<ActivityRow, "actor"> & {
        actor: ActivityRow["actor"] | ActivityRow["actor"][];
      })[]) ?? []).map((a) => ({ ...a, actor: one(a.actor) })) as ActivityRow[];
      setItems(rows);
    };

    (async () => {
      sb = await v2RealtimeClient();
      if (cancelled) return;
      channel = sb
        .channel(`v2-activity-${orgId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "v2_activity", filter: `org_id=eq.${orgId}` },
          () => {
            refresh();
          },
        )
        .subscribe();
    })();

    return () => {
      cancelled = true;
      if (sb && channel) sb.removeChannel(channel);
    };
  }, [orgId]);

  if (items.length === 0) {
    return (
      <section className={styles.module}>
        <p className={styles.sectionLabel}>Activity</p>
        <div className={styles.feedEmpty}>
          <span className={styles.feedIcon} data-kind="empty" aria-hidden>
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 2l2.4 5.4L20 8l-4 4 1 6-5-3-5 3 1-6-4-4 5.6-.6z" />
            </svg>
          </span>
          <span className={styles.feedEmptyText}>
            <span className={styles.feedEmptyTitle}>No activity yet</span>
            <span className={styles.feedEmptySub}>New rounds, photos, RSVPs, and songs will show up here.</span>
          </span>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.module}>
      <p className={styles.sectionLabel}>Activity</p>
      <div className={styles.feedList}>
        {items.map((it) => {
          const inner = (
            <>
              <Leading it={it} />
              <Body it={it} />
              <Accessory it={it} />
            </>
          );
          // Rounds/articles carry an in-app `link`; photos/songs open a drawer.
          const drawer = !it.link ? (it.kind === "photo" ? "photos" : it.kind === "song" ? "music" : null) : null;
          if (it.link) {
            return (
              <Link key={it.id} href={it.link} className={styles.feedRow}>
                {inner}
              </Link>
            );
          }
          if (drawer) {
            return (
              <button
                key={it.id}
                type="button"
                className={styles.feedRow}
                onClick={() => window.dispatchEvent(new CustomEvent("ui:open-drawer", { detail: { name: drawer } }))}
              >
                {inner}
              </button>
            );
          }
          return (
            <div key={it.id} className={styles.feedRow}>
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
