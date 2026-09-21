"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { LoozerTree } from "@/components/LoozerTree";
import styles from "./MembersDirectory.module.css";

// Mapbox is heavy — only load it when the Map tab is opened.
const LoozerMap = dynamic(() => import("@/components/LoozerMap").then((m) => m.LoozerMap), {
  ssr: false,
  loading: () => <p className={styles.stub}>Loading map…</p>,
});

interface Member {
  id: string;
  displayName: string;
  fullName: string | null;
  avatarUrl: string | null;
  sponsorId: string | null;
  isFounder: boolean;
  latitude: number | null;
  longitude: number | null;
  city: string | null;
  state: string | null;
  eventsAttended: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return (name[0] || "?").toUpperCase();
}

type View = "grid" | "tree" | "map";

/**
 * Members directory (#187 Phase 3) — v1 /loozers parity, re-skinned. Grid of
 * member cards (avatar, events-attended badge, name, follow star) that open a
 * member detail page. Tree + Map views are being ported next.
 */
export default function MembersDirectory({
  slug,
  orgId,
  viewerId,
  title,
}: {
  slug: string;
  orgId: string;
  viewerId: string;
  title: string;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [following, setFollowing] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const [q, setQ] = useState("");
  const [view, setView] = useState<View>("grid");
  const [busy, setBusy] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [mRes, fRes] = await Promise.all([
          fetch(`/api/v2/members?orgId=${orgId}`),
          fetch(`/api/v2/follows`),
        ]);
        const m = mRes.ok ? await mRes.json() : { members: [] };
        const f = fRes.ok ? await fRes.json() : { follows: [] };
        if (cancelled) return;
        setMembers(m.members || []);
        setFollowing(new Set((f.follows || []).map((x: { favorite_user_id: string }) => x.favorite_user_id)));
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const query = q.trim().toLowerCase();
  const shown = members.filter(
    (m) => !query || m.displayName.toLowerCase().includes(query) || (m.fullName || "").toLowerCase().includes(query),
  );

  async function toggleFollow(id: string) {
    if (id === viewerId || busy.has(id)) return;
    const isF = following.has(id);
    setBusy((s) => new Set(s).add(id));
    setFollowing((s) => {
      const n = new Set(s);
      if (isF) n.delete(id);
      else n.add(id);
      return n;
    });
    try {
      const res = await fetch(`/api/v2/follows`, {
        method: isF ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteUserId: id }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setFollowing((s) => {
        const n = new Set(s);
        if (isF) n.add(id);
        else n.delete(id);
        return n;
      });
    } finally {
      setBusy((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.tabs} role="group" aria-label="View">
          {(["grid", "tree", "map"] as const).map((v) => (
            <button key={v} type="button" className={styles.tab} data-on={view === v || undefined} onClick={() => setView(v)}>
              {v === "grid" ? "Grid" : v === "tree" ? "Tree" : "Map"}
            </button>
          ))}
        </div>
      </div>

      {view === "grid" && (
        <>
          <input className={styles.search} value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${title.toLowerCase()}`} />
          {!loaded ? (
            <p className={styles.stub}>Loading…</p>
          ) : shown.length === 0 ? (
            <p className={styles.stub}>No matches.</p>
          ) : (
            <div className={styles.grid}>
              {shown.map((m) => {
                const isF = following.has(m.id);
                const self = m.id === viewerId;
                return (
                  <Link key={m.id} href={`/new/${slug}/loozers/${m.id}`} className={styles.card}>
                    {!self && (
                      <button
                        type="button"
                        className={styles.star}
                        data-on={isF || undefined}
                        aria-label={isF ? "Unfollow" : "Follow"}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          toggleFollow(m.id);
                        }}
                        disabled={busy.has(m.id)}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill={isF ? "currentColor" : "none"} stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                        </svg>
                      </button>
                    )}
                    <span className={styles.avatarWrap}>
                      {m.avatarUrl ? (
                        <img src={m.avatarUrl} alt="" className={styles.avatar} />
                      ) : (
                        <span className={styles.avatarFallback}>{initials(m.displayName)}</span>
                      )}
                      {m.eventsAttended > 0 && <span className={styles.eventsBadge} title={`${m.eventsAttended} events`}>{m.eventsAttended}</span>}
                    </span>
                    <span className={styles.cardName}>{m.displayName}</span>
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}

      {view === "tree" && (
        loaded && members.length > 0 ? (
          <LoozerTree
            loozers={members.map((m) => ({
              id: m.id,
              display_name: m.displayName,
              full_name: null,
              avatar_url: m.avatarUrl,
              sponsor_id: m.sponsorId,
              is_founder: m.isFounder,
              events_attended: m.eventsAttended,
            }))}
            currentUserId={viewerId}
            basePath={`/new/${slug}/loozers`}
            heightStyle="70dvh"
          />
        ) : (
          <p className={styles.stub}>{loaded ? "No members to display." : "Loading…"}</p>
        )
      )}

      {view === "map" && (
        <div className={styles.mapWrap}>
          <LoozerMap
            basePath={`/new/${slug}/loozers`}
            currentUserId={viewerId}
            locationsUrl={`/api/v2/members/locations?orgId=${orgId}`}
          />
        </div>
      )}
    </div>
  );
}
