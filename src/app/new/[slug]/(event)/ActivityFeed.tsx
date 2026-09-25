"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { v2BrowserClient, v2RealtimeClient } from "@/lib/v2/supabase-browser";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { timeAgo, type ActivityRow } from "@/lib/v2/activity";
import { pickName } from "@/lib/v2/profile";
import { useNameMode } from "./NameMode";
import { useSimNow } from "./SimTime";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

const FEED_LIMIT = 15;
const SELECT =
  "id, kind, title, subtitle, image_url, link, created_at, ref_id, metadata, actor:v2_profiles(display_name, first_name, last_name, avatar_url)";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.length > 0) : []);
/** Announcements sent "as the system" present the org's system identity (name +
 *  avatar) rather than the real sender, who is still recorded as the actor. */
const isSystemAuthored = (it: ActivityRow) => it.kind === "announcement" && !!it.metadata?.system;
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
 *  otherwise the actor's circular avatar, otherwise a kind glyph. If the thumbnail
 *  fails to load (e.g. the underlying photo was deleted), fall back to the
 *  avatar/icon rather than showing a broken image. */
function Leading({ it, systemName, systemAvatar }: { it: ActivityRow; systemName: string; systemAvatar: string | null }) {
  const mode = useNameMode();
  const [thumbBroken, setThumbBroken] = useState(false);
  const thumb = it.kind !== "rsvp" && !thumbBroken ? it.image_url : null;
  if (thumb) return <img className={styles.feedThumb} src={thumb} alt="" onError={() => setThumbBroken(true)} />;
  // System-authored announcements show the org's system identity.
  if (isSystemAuthored(it)) {
    return systemAvatar
      ? <img className={styles.feedAvatar} src={systemAvatar} alt="" />
      : <span className={styles.feedAvatarFallback}>{initial(systemName)}</span>;
  }
  if (it.actor?.avatar_url) return <img className={styles.feedAvatar} src={it.actor.avatar_url} alt="" />;
  if (it.actor) return <span className={styles.feedAvatarFallback}>{initial(pickName(it.actor, mode))}</span>;
  return <KindIcon kind={it.kind} />;
}

/** Right-aligned strip of a few extra thumbnails for a multi-photo upload. The
 *  leading visual already shows the first; this shows the next few, with a "+N"
 *  overlay on the last when the batch has more than we display. */
function PhotoStrip({ it }: { it: ActivityRow }) {
  if (it.kind !== "photo") return null;
  const thumbs = strArr(it.metadata?.thumbs);
  const extra = thumbs.slice(1, 4); // leading shows thumbs[0]
  if (extra.length === 0) return null;
  const count = num(it.metadata?.count) ?? thumbs.length;
  const moreCount = count - (1 + extra.length);
  return (
    <span className={styles.feedThumbs} aria-hidden>
      {extra.map((url, i) => (
        <span key={i} className={styles.feedThumbsItem}>
          <img src={url} alt="" />
          {i === extra.length - 1 && moreCount > 0 && <span className={styles.feedThumbsMore}>+{moreCount}</span>}
        </span>
      ))}
    </span>
  );
}

/** Right-aligned accessory. Rounds show score + strokes to par. */
function Accessory({ it }: { it: ActivityRow }) {
  if (it.kind === "round") {
    if (it.metadata?.live) return <span className={styles.feedLive}>LIVE</span>;
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

/** The body: the kind-specific action/status on top, then name + timestamp
 *  together on one line at the bottom (name honors the org's name-display mode).
 *  RSVP reads "Marked their RSVP as {status}" — the name lives on the bottom row
 *  like every other kind, not in the sentence. */
function Body({ it, systemName }: { it: ActivityRow; systemName: string }) {
  const mode = useNameMode();
  const now = useSimNow();
  const name = isSystemAuthored(it) ? systemName : it.actor ? pickName(it.actor, mode) : null;
  const likelihood = it.kind === "rsvp" ? num(it.metadata?.likelihood) : null;
  const action = it.kind === "rsvp" ? `Marked their RSVP as ${it.title}` : it.title;

  return (
    <span className={styles.feedMain}>
      <span className={styles.feedAction}>
        {likelihood !== null && <span className={styles.feedActionDot} data-likelihood={likelihood} aria-hidden />}
        {action}
      </span>
      {it.subtitle && <span className={styles.feedActionSub}>{it.subtitle}</span>}
      <span className={styles.feedMeta}>
        {name && (
          <>
            <span className={styles.feedMetaName}>{name}</span>,{" "}
          </>
        )}
        {timeAgo(it.created_at, now)}
      </span>
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
  systemName,
  systemAvatar,
}: {
  initialItems: ActivityRow[];
  orgId: string;
  systemName: string;
  systemAvatar: string | null;
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
        // INSERT (new event), UPDATE (e.g. a bulk photo count/image changed), and
        // DELETE (a photo whose activity row was removed) all refetch the slice so
        // the feed stays consistent live. DELETE filtering needs REPLICA IDENTITY
        // FULL on v2_activity (migration 00204) so org_id is present in the old row.
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "v2_activity", filter: `org_id=eq.${orgId}` },
          () => refresh(),
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "v2_activity", filter: `org_id=eq.${orgId}` },
          () => refresh(),
        )
        .on(
          "postgres_changes",
          { event: "DELETE", schema: "public", table: "v2_activity", filter: `org_id=eq.${orgId}` },
          () => refresh(),
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
              <Leading it={it} systemName={systemName} systemAvatar={systemAvatar} />
              <Body it={it} systemName={systemName} />
              <PhotoStrip it={it} />
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
            // Photo rows carry the upload batch (ref_id) so the gallery opens
            // filtered to just that upload (clearable back to the full grid).
            const detail =
              drawer === "photos" && it.ref_id ? { name: drawer, bulk: it.ref_id } : { name: drawer };
            return (
              <button
                key={it.id}
                type="button"
                className={styles.feedRow}
                onClick={() => window.dispatchEvent(new CustomEvent("ui:open-drawer", { detail }))}
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
