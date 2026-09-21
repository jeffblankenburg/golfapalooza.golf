"use client";
/* eslint-disable @next/next/no-img-element */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useNameMode } from "@/app/new/[slug]/(event)/NameMode";
import { pickName } from "@/lib/v2/profile";
import styles from "./MemberDetail.module.css";

interface Ref {
  id: string;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  nickname: string | null;
  avatar_url: string | null;
}
interface MemberProfile extends Ref {
  city: string | null;
  state: string | null;
  is_founder: boolean;
  birthdate: string | null;
  playing_since: number | null;
  occupation: string | null;
  swings: string | null;
  typical_shot: string | null;
  shirt_size: string | null;
  fun_fact: string | null;
  best_shot: string | null;
}
interface Toggles {
  notify_round_started: boolean;
  notify_hole_completed: boolean;
  notify_round_completed: boolean;
}
interface Detail {
  member: MemberProfile;
  sponsor: Ref | null;
  descendants: Ref[];
  accolades: { title: string; year: number | null }[];
  handicap: number | null;
  eventsAttended: number;
  isFollowing: boolean;
  followToggles: Toggles | null;
}

const TOGGLES: { key: keyof Toggles; label: string }[] = [
  { key: "notify_round_started", label: "Round started" },
  { key: "notify_hole_completed", label: "Hole-by-hole" },
  { key: "notify_round_completed", label: "Round finished" },
];

function initials(name: string) {
  const p = name.trim().split(/\s+/);
  return (p.length >= 2 ? p[0][0] + p[p.length - 1][0] : name[0] || "?").toUpperCase();
}

export default function MemberDetail({
  slug,
  orgId,
  memberId,
  viewerId,
}: {
  slug: string;
  orgId: string;
  memberId: string;
  viewerId: string;
}) {
  const router = useRouter();
  const mode = useNameMode();
  const [d, setD] = useState<Detail | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [following, setFollowing] = useState(false);
  const [toggles, setToggles] = useState<Toggles>({ notify_round_started: true, notify_hole_completed: true, notify_round_completed: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/members/${memberId}?orgId=${orgId}`);
        const data = res.ok ? ((await res.json()) as Detail) : null;
        if (cancelled) return;
        setD(data);
        if (data) {
          setFollowing(data.isFollowing);
          if (data.followToggles) setToggles(data.followToggles);
        }
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [memberId, orgId]);

  async function toggleFollow() {
    const next = !following;
    setFollowing(next);
    try {
      const res = await fetch(`/api/v2/follows`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteUserId: memberId }),
      });
      if (!res.ok) throw new Error();
      if (next) setToggles({ notify_round_started: true, notify_hole_completed: true, notify_round_completed: true });
    } catch {
      setFollowing(!next);
    }
  }

  async function setToggle(key: keyof Toggles, value: boolean) {
    setToggles((t) => ({ ...t, [key]: value }));
    try {
      await fetch(`/api/v2/follows`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favoriteUserId: memberId, [key]: value }),
      });
    } catch {
      setToggles((t) => ({ ...t, [key]: !value }));
    }
  }

  if (!loaded) return <div className={styles.wrap}><p className={styles.stub}>Loading…</p></div>;
  if (!d) return <div className={styles.wrap}><p className={styles.stub}>Member not found.</p></div>;

  const { member: m } = d;
  const name = pickName(m, mode);
  const location = [m.city, m.state].filter(Boolean).join(", ");
  const self = memberId === viewerId;

  const bio: [string, string][] = [];
  if (m.occupation) bio.push(["Occupation", m.occupation]);
  if (m.playing_since) bio.push(["Playing since", String(m.playing_since)]);
  if (m.swings) bio.push(["Swings", m.swings]);
  if (m.typical_shot) bio.push(["Typical shot", m.typical_shot]);
  if (m.shirt_size) bio.push(["Shirt", m.shirt_size]);
  if (m.best_shot) bio.push(["Best shot", m.best_shot]);

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.back} onClick={() => router.push(`/new/${slug}/loozers`)} aria-label="Back">
        <svg width="20" height="20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
      </button>

      <div className={styles.header}>
        {m.avatar_url ? <img src={m.avatar_url} alt="" className={styles.avatar} /> : <span className={styles.avatarFallback}>{initials(name)}</span>}
        <h1 className={styles.name}>{name}</h1>
        <div className={styles.sub}>
          {m.is_founder && <span className={styles.founder}>Founder</span>}
          {location && <span>{location}</span>}
        </div>
        {!self && (
          <button type="button" className={styles.followBtn} data-following={following || undefined} onClick={toggleFollow}>
            {following ? "Following" : "Follow"}
          </button>
        )}
      </div>

      {!self && following && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Notify me when they…</h2>
          {TOGGLES.map((t) => (
            <label key={t.key} className={styles.toggleRow}>
              <span>{t.label}</span>
              <input type="checkbox" checked={toggles[t.key]} onChange={(e) => setToggle(t.key, e.target.checked)} />
            </label>
          ))}
        </div>
      )}

      <div className={styles.stats}>
        <div className={styles.stat}><span className={styles.statVal}>{d.handicap != null ? d.handicap.toFixed(1) : "—"}</span><span className={styles.statLabel}>Handicap</span></div>
        <div className={styles.stat}><span className={styles.statVal}>{d.eventsAttended}</span><span className={styles.statLabel}>Events</span></div>
        <div className={styles.stat}><span className={styles.statVal}>{d.accolades.length}</span><span className={styles.statLabel}>Accolades</span></div>
      </div>

      {m.fun_fact && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Fun fact</h2>
          <p className={styles.funFact}>{m.fun_fact}</p>
        </div>
      )}

      {bio.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>About</h2>
          {bio.map(([k, v]) => (
            <div key={k} className={styles.bioRow}><span className={styles.bioKey}>{k}</span><span className={styles.bioVal}>{v}</span></div>
          ))}
        </div>
      )}

      {d.sponsor && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Sponsored by</h2>
          <Link href={`/new/${slug}/loozers/${d.sponsor.id}`} className={styles.personRow}>
            {d.sponsor.avatar_url ? <img src={d.sponsor.avatar_url} alt="" className={styles.personAvatar} /> : <span className={styles.personFallback}>{initials(pickName(d.sponsor, mode))}</span>}
            <span>{pickName(d.sponsor, mode)}</span>
          </Link>
        </div>
      )}

      {d.descendants.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Sponsored ({d.descendants.length})</h2>
          {d.descendants.map((s) => (
            <Link key={s.id} href={`/new/${slug}/loozers/${s.id}`} className={styles.personRow}>
              {s.avatar_url ? <img src={s.avatar_url} alt="" className={styles.personAvatar} /> : <span className={styles.personFallback}>{initials(pickName(s, mode))}</span>}
              <span>{pickName(s, mode)}</span>
            </Link>
          ))}
        </div>
      )}

      {d.accolades.length > 0 && (
        <div className={styles.card}>
          <h2 className={styles.cardTitle}>Accolades</h2>
          {d.accolades.map((a, i) => (
            <div key={i} className={styles.accoladeRow}>
              <span>{a.title}</span>
              {a.year != null && <span className={styles.accoladeYear}>{a.year}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
