"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import styles from "./GamePicker.module.css";
import type { EspnGame } from "@/lib/v2/sports/espn";

const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const toEspnDate = (s: string) => s.replaceAll("-", "");

function gameTimeLabel(g: EspnGame): string {
  if (g.state === "post") return g.statusDetail || "Final";
  if (g.state === "in") return g.statusDetail || "Live";
  if (!g.startTime) return g.statusDetail || "";
  try {
    return new Date(g.startTime).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch {
    return g.statusDetail || "";
  }
}

function TeamRow({ c, line }: { c: EspnGame["home"]; line?: string | null }) {
  if (!c) return <span className={styles.team}>TBD</span>;
  return (
    <span className={styles.team}>
      {c.logo ? <img className={styles.logo} src={c.logo} alt="" width={20} height={20} /> : <span className={styles.logoFallback} style={{ background: c.color ?? "var(--line)" }} />}
      <span className={styles.abbrev}>{c.abbrev || c.name}</span>
      {line && <span className={styles.teamLine}>{line}</span>}
    </span>
  );
}

/** The favored team's spread as " (-3.5)", else "" — for the side that's favored. */
function spreadFor(g: EspnGame, side: "home" | "away"): string | null {
  if (g.spread == null || g.spread === 0 || g.favorite !== side) return null;
  return `(-${g.spread})`;
}

/** No posted line → the game is a straight-up pick ("PK"). */
function noLine(g: EspnGame): boolean {
  return g.spread == null || g.spread === 0 || g.favorite == null;
}

/** Plain-text matchup with the line beside the favored team (for the selected pills). */
function matchupLabel(g: EspnGame): string {
  const away = (g.away?.abbrev || g.away?.name || "AWY") + (spreadFor(g, "away") ? ` ${spreadFor(g, "away")}` : "");
  const home = (g.home?.abbrev || g.home?.name || "HOM") + (spreadFor(g, "home") ? ` ${spreadFor(g, "home")}` : "");
  return `${away} @ ${home}${noLine(g) ? " (PK)" : ""}`;
}

/**
 * Browse + select ESPN games (#230). One league shown at a time, but selection
 * ACCUMULATES across league + date changes (so a pool can mix sports). A date
 * navigator (±day, ±week) makes weekly series quick, and a team filter tames big
 * slates (NCAA). Returns full game objects so callers keep ESPN team ids.
 */
export default function GamePicker({
  mode = "single",
  value,
  onChange,
  initialDate,
  initialLeague,
}: {
  mode?: "single" | "multi";
  value: EspnGame[];
  onChange: (games: EspnGame[]) => void;
  initialDate?: string; // YYYY-MM-DD
  initialLeague?: string;
}) {
  const [leagues, setLeagues] = useState<{ key: string; label: string }[]>([]);
  const [league, setLeague] = useState(initialLeague ?? "");
  const [date, setDate] = useState(initialDate ?? ymd(new Date()));
  const [filter, setFilter] = useState("");
  const [games, setGames] = useState<EspnGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedIds = useMemo(() => new Set(value.map((g) => g.espnEventId)), [value]);

  useEffect(() => {
    fetch("/api/v2/sports/games")
      .then((r) => r.json())
      .then((d) => {
        const ls = d.leagues ?? [];
        setLeagues(ls);
        setLeague((cur) => cur || (initialLeague && ls.some((l: { key: string }) => l.key === initialLeague) ? initialLeague : ls[0]?.key) || "");
      })
      .catch(() => setError("Could not load leagues."));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    if (!league) return;
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/v2/sports/games?league=${encodeURIComponent(league)}&date=${toEspnDate(date)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Failed");
      setGames(d.games ?? []);
    } catch {
      setError("Could not load games. Try again.");
      setGames([]);
    } finally {
      setLoading(false);
    }
  }, [league, date]);

  useEffect(() => {
    load();
  }, [load]);

  const shiftDate = (days: number) => {
    const d = new Date(`${date}T00:00:00`);
    d.setDate(d.getDate() + days);
    setDate(ymd(d));
  };

  function toggle(g: EspnGame) {
    if (mode === "single") {
      onChange(selectedIds.has(g.espnEventId) ? [] : [g]);
      return;
    }
    onChange(selectedIds.has(g.espnEventId) ? value.filter((x) => x.espnEventId !== g.espnEventId) : [...value, g]);
  }

  const shown = filter.trim()
    ? games.filter((g) =>
        `${g.shortName} ${g.home?.name ?? ""} ${g.home?.abbrev ?? ""} ${g.away?.name ?? ""} ${g.away?.abbrev ?? ""}`
          .toLowerCase()
          .includes(filter.trim().toLowerCase()),
      )
    : games;

  return (
    <div className={styles.picker}>
      <select className={styles.league} value={league} onChange={(e) => setLeague(e.target.value)} aria-label="League">
        {leagues.map((l) => (
          <option key={l.key} value={l.key}>{l.label}</option>
        ))}
      </select>

      <div className={styles.dateNav}>
        <button type="button" className={styles.navBtn} onClick={() => shiftDate(-7)} title="Back a week">−1w</button>
        <button type="button" className={styles.navArrow} onClick={() => shiftDate(-1)} aria-label="Back a day">‹</button>
        <input className={styles.date} type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Date" />
        <button type="button" className={styles.navArrow} onClick={() => shiftDate(1)} aria-label="Forward a day">›</button>
        <button type="button" className={styles.navBtn} onClick={() => shiftDate(7)} title="Forward a week">+1w</button>
      </div>

      {games.length > 8 && (
        <input className={styles.filter} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filter teams…" />
      )}

      {mode === "multi" && value.length > 0 && (
        <div className={styles.chips}>
          {value.map((g) => (
            <button key={g.espnEventId} type="button" className={styles.chip} onClick={() => toggle(g)} title="Remove">
              {matchupLabel(g)} <span className={styles.chipX}>×</span>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className={styles.note}>Loading games…</p>
      ) : error ? (
        <p className={styles.err}>{error}</p>
      ) : shown.length === 0 ? (
        <p className={styles.note}>{games.length === 0 ? "No games on this date for this league." : "No games match that filter."}</p>
      ) : (
        <ul className={styles.list}>
          {shown.map((g) => {
            const on = selectedIds.has(g.espnEventId);
            return (
              <li key={g.espnEventId}>
                <button type="button" className={styles.game} data-on={on || undefined} onClick={() => toggle(g)}>
                  <span className={styles.matchup}>
                    <TeamRow c={g.away} line={spreadFor(g, "away")} />
                    <span className={styles.at}>@</span>
                    <TeamRow c={g.home} line={spreadFor(g, "home")} />
                    {noLine(g) && <span className={styles.pk} title="No line — straight-up pick">PK</span>}
                  </span>
                  <span className={styles.meta}>
                    {g.tv && <span className={styles.tv}>{g.tv}</span>}
                    <span className={styles.time} data-state={g.state}>{gameTimeLabel(g)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
