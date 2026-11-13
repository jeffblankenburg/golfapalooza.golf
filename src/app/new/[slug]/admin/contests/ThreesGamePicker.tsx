"use client";

import { useEffect, useState } from "react";
import type { EspnGameInput } from "@/lib/v2/contests/pickem-server";
import styles from "./[contestId]/threes.module.css";
/* eslint-disable @next/next/no-img-element */

const LEAGUES = [
  { key: "mens-college-basketball", label: "NCAA Men's" },
  { key: "womens-college-basketball", label: "NCAA Women's" },
  { key: "nba", label: "NBA" },
];

interface EspnCompetitor {
  espnId: string;
  name: string;
  shortName: string;
  abbrev: string;
  logo: string | null;
  color: string | null;
  homeAway: "home" | "away";
}
interface EspnGame {
  espnEventId: string;
  league: string;
  shortName: string;
  startTime: string;
  state: "pre" | "in" | "post";
  statusDetail: string;
  tv: string | null;
  home: EspnCompetitor | null;
  away: EspnCompetitor | null;
  spread?: number | null;
  favorite?: "home" | "away" | null;
}

/** Today's date as ESPN's YYYYMMDD, in the admin's LOCAL timezone (so "today"
 *  matches the person opening the picker, not the server's UTC day). Without an
 *  explicit date ESPN returns its last completed slate (yesterday's games). */
function todayYMD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}${m}${day}`;
}

/** Since the list is always today, show just the tip-off time (not the date) for
 *  upcoming games; live/final games show their status. */
function statusText(g: EspnGame): string {
  if (g.state === "pre") {
    try {
      return new Date(g.startTime).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    } catch {
      return g.statusDetail;
    }
  }
  return g.statusDetail;
}

export function toGameInput(g: EspnGame): EspnGameInput {
  return {
    espnEventId: g.espnEventId,
    league: g.league,
    startTime: g.startTime,
    tv: g.tv,
    spread: g.spread ?? null,
    favorite: g.favorite ?? null,
    away: g.away ? { name: g.away.name, shortName: g.away.shortName, abbrev: g.away.abbrev, logo: g.away.logo, color: g.away.color } : null,
    home: g.home ? { name: g.home.name, shortName: g.home.shortName, abbrev: g.home.abbrev, logo: g.home.logo, color: g.home.color } : null,
  };
}

/** A modal that lists a day's basketball slate and hands back the chosen game. */
export default function ThreesGamePicker({
  title = "Pick a game",
  busy = false,
  onPick,
  onClose,
}: {
  title?: string;
  busy?: boolean;
  onPick: (game: EspnGameInput) => void;
  onClose: () => void;
}) {
  const [league, setLeague] = useState("mens-college-basketball");
  const [games, setGames] = useState<EspnGame[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Always today's slate; re-fetch when the league changes. No date, no Load button.
  useEffect(() => {
    let active = true;
    void (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/v2/sports/games?league=${league}&date=${todayYMD()}`);
        const d = await res.json().catch(() => ({}));
        if (!active) return;
        if (!res.ok) throw new Error(d.error || "Could not load games");
        setGames((d.games as EspnGame[]) ?? []);
      } catch (e) {
        if (active) setErr(e instanceof Error ? e.message : "Could not load games");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [league]);

  return (
    <div className={styles.modalOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHead}>
          <h2 className={styles.modalTitle}>{title}</h2>
          <button type="button" className={styles.modalClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <select className={styles.leagueSelect} value={league} onChange={(e) => setLeague(e.target.value)} aria-label="League">
          {LEAGUES.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
        </select>
        {err && <p className={styles.err}>{err}</p>}
        <div className={styles.modalList}>
          {loading ? (
            <p className={styles.muted}>Loading games…</p>
          ) : games.length === 0 ? (
            <p className={styles.muted}>No games today for this league.</p>
          ) : (
            <ul className={styles.gameList}>
              {games.map((g) => (
                <li key={g.espnEventId}>
                  <button type="button" className={styles.gamePick} disabled={busy} onClick={() => onPick(toGameInput(g))}>
                    <span className={styles.gamePickTeams}>
                      <span className={styles.gamePickTeam}>
                        {g.away?.logo && <img src={g.away.logo} alt="" className={styles.gamePickLogo} />}
                        <span className={styles.gamePickName}>{g.away?.abbrev || g.away?.name || "Away"}</span>
                      </span>
                      <span className={styles.gamePickAt}>@</span>
                      <span className={styles.gamePickTeam}>
                        {g.home?.logo && <img src={g.home.logo} alt="" className={styles.gamePickLogo} />}
                        <span className={styles.gamePickName}>{g.home?.abbrev || g.home?.name || "Home"}</span>
                      </span>
                    </span>
                    <span className={styles.gamePickStatus}>{statusText(g)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
