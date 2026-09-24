"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./score.module.css";
import { subscribeToV2Round } from "@/lib/v2/realtime/round-channel";
import RoundComments from "./RoundComments";
import OtherGroups from "./OtherGroups";
import ScoringMapModal, { anyHoleMapped } from "./ScoringMapModal";
import SideGameStandings, { type RoundGame } from "./SideGameStandings";

export interface ScoreHole {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
  hole_name: string | null;
  // Per-hole GPS + imagery (map modal); sparse — only mapped holes have these.
  tee_latitude?: number | null;
  tee_longitude?: number | null;
  green_latitude?: number | null;
  green_longitude?: number | null;
  green_front_latitude?: number | null;
  green_front_longitude?: number | null;
  green_back_latitude?: number | null;
  green_back_longitude?: number | null;
  drive_latitude?: number | null;
  drive_longitude?: number | null;
  center_line?: [number, number][] | null;
  overhead_image_url?: string | null;
  green_image_url?: string | null;
}
export interface ScorePlayer {
  id: string; // round_player_id — the canonical local key
  name: string;
  isGuest: boolean;
  teeName: string | null;
  teeColor: string | null;
}
interface Cell {
  strokes?: number | null;
  putts?: number | null;
  fairway_hit?: boolean | null;
  green_in_regulation?: boolean | null;
  penalty_strokes?: number | null;
}
type Scores = Record<string, Record<number, Cell>>;
type SaveStatus = "idle" | "saving" | "saved" | "error";
type StatKey = "putts" | "fairways" | "gir" | "penalties";

const ALL_STATS: { key: StatKey; label: string }[] = [
  { key: "putts", label: "Putts" },
  { key: "fairways", label: "Fairways" },
  { key: "gir", label: "GIR" },
  { key: "penalties", label: "Penalties" },
];

const TEE_HEX: Record<string, string> = {
  black: "#111827", blue: "#2563eb", white: "#f3f4f6", gold: "#eab308", yellow: "#facc15",
  green: "#16a34a", red: "#dc2626", silver: "#9ca3af", orange: "#f97316", purple: "#9333ea",
  pink: "#ec4899", navy: "#1e3a8a", teal: "#14b8a6",
};
function teeBadge(color: string | null): React.CSSProperties {
  const hex = color ? TEE_HEX[color.toLowerCase()] : undefined;
  if (!hex) return { background: "var(--line)", color: "var(--ink)" };
  const light = hex === "#f3f4f6" || hex === "#facc15" || hex === "#eab308";
  return { background: hex, color: light ? "#374151" : "#fff", border: hex === "#f3f4f6" ? "1px solid #9ca3af" : undefined };
}

// Normalize a cell to the full stat set so every row in a batch upsert carries
// the same columns (avoids PostgREST null-filling unintended fields). Local
// state mirrors the DB, so nulls here are the true current values.
function fullRow(hole_number: number, c: Cell) {
  return {
    hole_number,
    strokes: c.strokes ?? null,
    putts: c.putts ?? null,
    fairway_hit: c.fairway_hit ?? null,
    green_in_regulation: c.green_in_regulation ?? null,
    penalty_strokes: c.penalty_strokes ?? null,
  };
}

function markOf(strokes: number | null | undefined, par: number): string {
  if (strokes == null) return "";
  const d = strokes - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 0) return "par";
  if (d === 1) return "bogey";
  return "double";
}

export default function ScoreEntry({
  slug,
  roundId,
  courseName,
  holes,
  roundTeeColor = null,
  players,
  games = [],
  strokesByPlayer = {},
  brandColor = "#0a5c36",
  initialScores,
  trackedStats: initialTracked,
  initialStatus,
  viewerId,
  orgId,
}: {
  slug: string;
  roundId: string;
  courseName: string;
  holes: ScoreHole[];
  roundTeeColor?: string | null;
  players: ScorePlayer[];
  games?: RoundGame[];
  strokesByPlayer?: Record<string, Record<number, number>>;
  brandColor?: string;
  initialScores: Scores;
  trackedStats: StatKey[];
  initialStatus: string;
  viewerId: string;
  orgId: string;
}) {
  const router = useRouter();
  const [scores, setScores] = useState<Scores>(initialScores);
  const [idx, setIdx] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [liveStatus, setLiveStatus] = useState<"live" | "connecting" | "offline">("connecting");
  const [sharedCopied, setSharedCopied] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const anyMapped = anyHoleMapped(holes);
  const [tracked, setTracked] = useState<StatKey[]>(initialTracked);
  const [status, setStatus] = useState(initialStatus);
  const [gameList, setGameList] = useState<RoundGame[]>(games);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeErr, setCompleteErr] = useState<string | null>(null);

  const hole = holes[idx];
  const hasBothNines = holes.some((h) => h.hole_number <= 9) && holes.some((h) => h.hole_number >= 10);
  const front9 = holes.filter((h) => h.hole_number <= 9);
  const back9 = holes.filter((h) => h.hole_number >= 10);

  const dirtyRef = useRef<Map<string, { round_player_id: string; hole_number: number } & Cell>>(new Map());
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced batch save ────────────────────────────────────────────────
  const flush = useCallback(async () => {
    const toSave = Array.from(dirtyRef.current.values());
    if (toSave.length === 0) return;
    dirtyRef.current.clear();
    setSaveStatus("saving");
    const grouped = new Map<string, ReturnType<typeof fullRow>[]>();
    for (const s of toSave) {
      const { round_player_id, hole_number, ...rest } = s;
      const arr = grouped.get(round_player_id) || [];
      arr.push(fullRow(hole_number, rest));
      grouped.set(round_player_id, arr);
    }
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/scores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          player_scores: Array.from(grouped.entries()).map(([rpId, s]) => ({ round_player_id: rpId, scores: s })),
        }),
      });
      if (res.ok) {
        setSaveStatus("saved");
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaveStatus("idle"), 1800);
      } else {
        setSaveStatus("error");
        for (const s of toSave) dirtyRef.current.set(`${s.round_player_id}-${s.hole_number}`, s);
      }
    } catch {
      setSaveStatus("error");
      for (const s of toSave) dirtyRef.current.set(`${s.round_player_id}-${s.hole_number}`, s);
    }
  }, [roundId]);

  const scheduleSave = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(flush, 900);
  }, [flush]);

  // Flush any pending edits on unmount.
  useEffect(() => {
    const dirty = dirtyRef;
    const ft = flushTimer;
    const st = savedTimer;
    return () => {
      if (ft.current) clearTimeout(ft.current);
      if (st.current) clearTimeout(st.current);
      const toSave = Array.from(dirty.current.values());
      if (toSave.length > 0) {
        const grouped = new Map<string, ReturnType<typeof fullRow>[]>();
        for (const s of toSave) {
          const { round_player_id, hole_number, ...rest } = s;
          const arr = grouped.get(round_player_id) || [];
          arr.push(fullRow(hole_number, rest));
          grouped.set(round_player_id, arr);
        }
        fetch(`/api/v2/rounds/${roundId}/scores`, {
          method: "POST",
          keepalive: true,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            player_scores: Array.from(grouped.entries()).map(([rpId, s]) => ({ round_player_id: rpId, scores: s })),
          }),
        });
      }
    };
  }, [roundId]);

  // ── Realtime sync (last-write-wins; skip cells we're actively editing) ────
  useEffect(() => {
    const unsub = subscribeToV2Round(roundId, {
      onScoreChange: ({ kind, row, old }) => {
        const ref = row ?? old;
        if (!ref) return;
        if (dirtyRef.current.has(`${ref.round_player_id}-${ref.hole_number}`)) return;
        setScores((prev) => {
          const next = { ...prev };
          const player = { ...(next[ref.round_player_id] || {}) };
          if (kind === "DELETE") {
            delete player[ref.hole_number];
          } else if (row) {
            player[ref.hole_number] = {
              strokes: row.strokes,
              putts: row.putts,
              fairway_hit: row.fairway_hit,
              green_in_regulation: row.green_in_regulation,
              penalty_strokes: row.penalty_strokes,
            };
          }
          next[ref.round_player_id] = player;
          return next;
        });
      },
      onRosterChange: ({ kind }) => {
        // Only a real add/remove of a player is structural enough to reload. Ignore
        // bookkeeping UPDATEs — every score save stamps v2_round_players.final_gross_score,
        // which would otherwise reload the page mid-scoring (notably on hole 1).
        if (kind === "INSERT" || kind === "DELETE") window.location.reload();
      },
      onRoundChange: ({ row }) => {
        if (row?.status) setStatus(row.status);
      },
      onStatusChange: (s) => {
        setLiveStatus(s === "SUBSCRIBED" ? "live" : s === "CHANNEL_ERROR" || s === "TIMED_OUT" || s === "CLOSED" ? "offline" : "connecting");
      },
    });
    return unsub;
  }, [roundId]);

  // ── Edit helpers ────────────────────────────────────────────────────────
  const writeCell = useCallback(
    (rpId: string, holeNo: number, patch: Cell) => {
      setScores((prev) => {
        const next = { ...prev };
        const player = { ...(next[rpId] || {}) };
        player[holeNo] = { ...player[holeNo], ...patch };
        next[rpId] = player;
        // Track the full merged cell so the save carries every set field.
        const merged = player[holeNo];
        dirtyRef.current.set(`${rpId}-${holeNo}`, { round_player_id: rpId, hole_number: holeNo, ...merged });
        return next;
      });
      scheduleSave();
    },
    [scheduleSave],
  );

  const bumpStrokes = (rpId: string, delta: number) => {
    const cur = scores[rpId]?.[hole.hole_number]?.strokes;
    if (cur == null) {
      // First tap seeds the score: + starts at par, − starts one under par.
      writeCell(rpId, hole.hole_number, { strokes: Math.max(1, delta > 0 ? hole.par : hole.par - 1) });
      return;
    }
    const nextVal = Math.min(20, Math.max(1, cur + delta));
    writeCell(rpId, hole.hole_number, { strokes: nextVal });
  };
  const bumpPutts = (rpId: string, delta: number) => {
    const cur = scores[rpId]?.[hole.hole_number]?.putts;
    if (cur == null) {
      writeCell(rpId, hole.hole_number, { putts: delta > 0 ? 1 : 0 });
      return;
    }
    writeCell(rpId, hole.hole_number, { putts: Math.min(10, Math.max(0, cur + delta)) });
  };
  const bumpPenalties = (rpId: string, delta: number) => {
    const cur = scores[rpId]?.[hole.hole_number]?.penalty_strokes;
    if (cur == null) {
      writeCell(rpId, hole.hole_number, { penalty_strokes: delta > 0 ? 1 : 0 });
      return;
    }
    writeCell(rpId, hole.hole_number, { penalty_strokes: Math.min(10, Math.max(0, cur + delta)) });
  };
  const cycleBool = (rpId: string, field: "fairway_hit" | "green_in_regulation") => {
    const cur = scores[rpId]?.[hole.hole_number]?.[field];
    // null → true → false → null
    const nextVal = cur == null ? true : cur === true ? false : null;
    writeCell(rpId, hole.hole_number, { [field]: nextVal } as Cell);
  };

  const toggleTracked = async (key: StatKey) => {
    const next = tracked.includes(key) ? tracked.filter((k) => k !== key) : [...tracked, key];
    setTracked(next);
    try {
      await fetch("/api/v2/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tracked_stats: next }),
      });
    } catch {
      /* preference is best-effort */
    }
  };

  // ── Completion ──────────────────────────────────────────────────────────
  const allComplete = useMemo(
    () => players.length > 0 && players.every((p) => holes.every((h) => scores[p.id]?.[h.hole_number]?.strokes != null)),
    [players, holes, scores],
  );

  const handleComplete = async () => {
    setCompleting(true);
    setCompleteErr(null);
    if (flushTimer.current) clearTimeout(flushTimer.current);
    await flush();
    try {
      const res = await fetch(`/api/v2/rounds/${roundId}/complete`, { method: "POST" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setCompleteErr(d.error || "Could not complete the round.");
        setCompleting(false);
        return;
      }
      router.push(`/new/${slug}`);
    } catch {
      setCompleteErr("Something went wrong.");
      setCompleting(false);
    }
  };

  const close = async () => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    await flush();
    router.push(`/new/${slug}`);
  };

  if (!hole) return <div className={styles.loading}>No holes to score.</div>;

  const liveLabel = liveStatus === "live" ? "Live" : liveStatus === "offline" ? "Offline" : "Connecting";

  // Share the public watch link so spectators can follow this round live.
  async function shareWatch() {
    const url = `${window.location.origin}/new/${slug}/rounds/${roundId}/watch`;
    const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
    try {
      if (nav.share) {
        await nav.share({ title: `Watch ${courseName}`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setSharedCopied(true);
      setTimeout(() => setSharedCopied(false), 1500);
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        setSharedCopied(true);
        setTimeout(() => setSharedCopied(false), 1500);
      } catch {
        /* ignore */
      }
    }
  }

  // Derived for live side-game standings (recomputes as scores change).
  const gross: Record<string, Record<number, number>> = {};
  if (gameList.length) {
    for (const pid in scores) {
      const m: Record<number, number> = {};
      const cells = scores[pid];
      for (const h in cells) {
        const st = cells[h].strokes;
        if (st != null) m[Number(h)] = st;
      }
      gross[pid] = m;
    }
  }
  const playerNames = Object.fromEntries(players.map((p) => [p.id, p.name]));
  const holeNumbers = holes.map((h) => h.hole_number);
  // Players who receive handicap strokes in at least one Net game — drives the
  // "pops" (stroke dots) shown on the scorecard for the current hole.
  const netPlayerIds = new Set<string>();
  for (const g of gameList) {
    if (g.is_net) for (const id of g.participant_ids) netPlayerIds.add(id);
  }

  return (
    <div className={styles.screen}>
      {/* Header */}
      <div className={styles.header}>
        <button type="button" className={styles.iconBtn} onClick={close} aria-label="Close scorer">
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
        <div className={styles.headMeta}>
          <span><strong>Hole {hole.hole_number}</strong></span>
          <span className={styles.headSep} />
          <span>Par <strong>{hole.par}</strong></span>
          {hole.yards != null && (
            <>
              <span className={styles.headSep} />
              <span><strong>{hole.yards}</strong> yds</span>
            </>
          )}
        </div>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={shareWatch}
          aria-label="Share live link"
          title={sharedCopied ? "Link copied" : "Share live link"}
        >
          {sharedCopied ? (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" /></svg>
          ) : (
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7" />
              <path d="M16 6l-4-4-4 4" />
              <path d="M12 2v13" />
            </svg>
          )}
        </button>
        <span className={styles.liveBadge} data-state={liveStatus}>
          <span className={styles.liveDot} />
          {liveLabel}
        </span>
      </div>

      {/* Mini scorecard */}
      <div className={styles.cardWrap}>
        <table className={styles.cardTable} style={{ minWidth: `${(holes.length + (hasBothNines ? 3 : 1) + 1) * 30}px` }}>
          <thead>
            <tr>
              <th className={styles.cardLead} />
              {holes.map((h, i) => (
                <Fragment key={h.hole_number}>
                  {h.hole_number === 10 && hasBothNines && <th className={styles.cardTot}>Out</th>}
                  <th>
                    <button type="button" className={styles.cardHoleBtn} data-active={h.hole_number === hole.hole_number} onClick={() => setIdx(i)}>
                      {h.hole_number}
                    </button>
                  </th>
                </Fragment>
              ))}
              {hasBothNines && <th className={styles.cardTot}>In</th>}
              <th className={styles.cardTot}>Tot</th>
            </tr>
          </thead>
          <tbody>
            <tr className={styles.cardParRow}>
              <td className={styles.cardLead}>Par</td>
              {holes.map((h) => (
                <Fragment key={h.hole_number}>
                  {h.hole_number === 10 && hasBothNines && <td className={styles.cardTot}>{front9.reduce((s, x) => s + x.par, 0)}</td>}
                  <td className={styles.cardCol} data-active={h.hole_number === hole.hole_number || undefined}>{h.par}</td>
                </Fragment>
              ))}
              {hasBothNines && <td className={styles.cardTot}>{back9.reduce((s, x) => s + x.par, 0)}</td>}
              <td className={styles.cardTot}>{holes.reduce((s, x) => s + x.par, 0)}</td>
            </tr>
            {holes.some((h) => h.yards != null) && (
              <tr className={styles.cardYdsRow}>
                <td className={styles.cardLead}>Yds</td>
                {holes.map((h) => (
                  <Fragment key={h.hole_number}>
                    {h.hole_number === 10 && hasBothNines && <td className={styles.cardTot}>{front9.reduce((s, x) => s + (x.yards ?? 0), 0) || ""}</td>}
                    <td className={styles.cardCol} data-active={h.hole_number === hole.hole_number || undefined}>{h.yards ?? ""}</td>
                  </Fragment>
                ))}
                {hasBothNines && <td className={styles.cardTot}>{back9.reduce((s, x) => s + (x.yards ?? 0), 0) || ""}</td>}
                <td className={styles.cardTot}>{holes.reduce((s, x) => s + (x.yards ?? 0), 0) || ""}</td>
              </tr>
            )}
            <tr className={styles.cardHcpRow}>
              <td className={styles.cardLead}>Hcp</td>
              {holes.map((h) => (
                <Fragment key={h.hole_number}>
                  {h.hole_number === 10 && hasBothNines && <td className={styles.cardTot} />}
                  <td className={styles.cardCol} data-active={h.hole_number === hole.hole_number || undefined}>{h.handicap_index || ""}</td>
                </Fragment>
              ))}
              {hasBothNines && <td className={styles.cardTot} />}
              <td className={styles.cardTot} />
            </tr>
            {players.map((p, pi) => {
              const total = holes.reduce((s, h) => s + (scores[p.id]?.[h.hole_number]?.strokes ?? 0), 0);
              const f9 = front9.reduce((s, h) => s + (scores[p.id]?.[h.hole_number]?.strokes ?? 0), 0);
              const b9 = back9.reduce((s, h) => s + (scores[p.id]?.[h.hole_number]?.strokes ?? 0), 0);
              const anyF = front9.some((h) => scores[p.id]?.[h.hole_number]?.strokes != null);
              const anyB = back9.some((h) => scores[p.id]?.[h.hole_number]?.strokes != null);
              const any = holes.some((h) => scores[p.id]?.[h.hole_number]?.strokes != null);
              return (
                <tr key={p.id} data-odd={pi % 2 === 1 || undefined}>
                  <td className={styles.cardLead}>
                    <span className={styles.cardInitial} style={teeBadge(p.teeColor)}>{(p.name[0] || "?").toUpperCase()}</span>
                  </td>
                  {holes.map((h) => {
                    const st = scores[p.id]?.[h.hole_number]?.strokes;
                    // Pops this player gets on this hole (net games) — shown as dots
                    // at the top of the cell so upcoming strokes read at a glance.
                    const pops = netPlayerIds.has(p.id) ? strokesByPlayer[p.id]?.[h.hole_number] ?? 0 : 0;
                    return (
                      <Fragment key={h.hole_number}>
                        {h.hole_number === 10 && hasBothNines && <td className={styles.cardTotVal}>{anyF ? f9 : ""}</td>}
                        <td className={styles.cardCell} data-active={h.hole_number === hole.hole_number || undefined}>
                          {pops > 0 && (
                            <span className={styles.cardPops}>
                              {Array.from({ length: pops }).map((_, i) => (
                                <span key={i} className={styles.cardPop} />
                              ))}
                            </span>
                          )}
                          {st != null && (
                            <span className={styles.mark} data-mark={markOf(st, h.par)}>
                              <span className={styles.markNum}>{st}</span>
                            </span>
                          )}
                        </td>
                      </Fragment>
                    );
                  })}
                  {hasBothNines && <td className={styles.cardTotVal}>{anyB ? b9 : ""}</td>}
                  <td className={styles.cardTotVal}>{any ? total : ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Course strip + save banner */}
      <div className={styles.courseStrip}>
        <span className={styles.courseName}>{courseName}</span>
        <div className={styles.saveBanner} data-state={saveStatus} aria-live="polite">
          {saveStatus === "saving" && <><span className={styles.spinner} />Saving…</>}
          {saveStatus === "saved" && "Saved"}
          {saveStatus === "error" && "Save failed — will retry"}
        </div>
      </div>

      {/* Nav */}
      <div className={styles.nav}>
        <button type="button" className={styles.iconBtn} onClick={() => setIdx((i) => Math.max(0, i - 1))} disabled={idx === 0} aria-label="Previous hole">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M15 19l-7-7 7-7" /></svg>
        </button>
        <div className={styles.navCenter}>
          {hole.hole_name && <span className={styles.holeName}>{hole.hole_name}</span>}
          {anyMapped && (
            <button type="button" className={styles.mapPill} onClick={() => setMapOpen(true)} aria-label="Open map">
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                <path d="M9 20l-6-2V4l6 2m0 14l6-2m-6 2V6m6 12l6 2V6l-6-2m0 14V4" />
              </svg>
              Map
            </button>
          )}
        </div>
        <button type="button" className={styles.iconBtn} onClick={() => setIdx((i) => Math.min(holes.length - 1, i + 1))} disabled={idx === holes.length - 1} aria-label="Next hole">
          <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M9 5l7 7-7 7" /></svg>
        </button>
      </div>

      {mapOpen && <ScoringMapModal holes={holes} startIndex={idx} roundTeeColor={roundTeeColor} onClose={() => setMapOpen(false)} />}

      {/* Panel */}
      <div className={styles.panel}>
        {players.map((p) => {
          const cell = scores[p.id]?.[hole.hole_number] || {};
          const strokes = cell.strokes;
          const played = holes.filter((h) => scores[p.id]?.[h.hole_number]?.strokes != null);
          const roundTotal = played.reduce((s, h) => s + (scores[p.id]![h.hole_number].strokes ?? 0), 0);
          const parPlayed = played.reduce((s, h) => s + h.par, 0);
          const toPar = roundTotal - parPlayed;
          const toParLabel = toPar === 0 ? "E" : toPar > 0 ? `+${toPar}` : `${toPar}`;
          // Pops: handicap strokes this player gets on the current hole (net games only).
          const pops = netPlayerIds.has(p.id) ? strokesByPlayer[p.id]?.[hole.hole_number] ?? 0 : 0;
          return (
            <div key={p.id} className={styles.playerRow}>
              <div className={styles.playerMain}>
                <div className={styles.playerId}>
                  <div className={styles.playerNameRow}>
                    {pops > 0 && (
                      <span className={styles.pops} aria-label={`${pops} handicap stroke${pops > 1 ? "s" : ""} this hole`}>
                        {Array.from({ length: pops }).map((_, i) => (
                          <span key={i} className={styles.pop} />
                        ))}
                      </span>
                    )}
                    <span className={styles.playerName}>{p.name}</span>
                  </div>
                  {p.teeName && <div className={styles.playerTee}>{p.teeName}</div>}
                </div>
                <div className={styles.runningTotal}>
                  {played.length > 0 && (
                    <span className={styles.runningNum}>
                      {roundTotal}
                      <sup className={styles.runningSup}>{toParLabel}</sup>
                    </span>
                  )}
                </div>
                <div className={styles.spacer} />

                {/* Strokes (always) — slides right on its own when putts is off. */}
                <div className={styles.stat}>
                  <button type="button" className={styles.stepBtn} data-kind="strokes" onClick={() => bumpStrokes(p.id, -1)} disabled={strokes != null && strokes <= 1}><span className={styles.glyph}>−</span></button>
                  <div className={`${styles.statVal} ${styles.statValStrokes}`}>
                    <span className={styles.statNum} data-mark={markOf(strokes, hole.par)}>{strokes ?? "·"}</span>
                    <span className={styles.statLabel}>Strokes</span>
                  </div>
                  <button type="button" className={styles.stepBtn} data-kind="strokes" onClick={() => bumpStrokes(p.id, 1)}><span className={styles.glyph}>+</span></button>
                </div>

                {/* Putts inline (v1), when tracked. */}
                {tracked.includes("putts") && (
                  <>
                    <div className={styles.statDivider} />
                    <div className={styles.stat}>
                      <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => bumpPutts(p.id, -1)} disabled={cell.putts != null && cell.putts <= 0}><span className={styles.glyph}>−</span></button>
                      <div className={`${styles.statVal} ${styles.statValMinor}`}>
                        <span className={styles.statNumMinor}>{cell.putts ?? "·"}</span>
                        <span className={styles.statLabel}>Putts</span>
                      </div>
                      <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => bumpPutts(p.id, 1)}><span className={styles.glyph}>+</span></button>
                    </div>
                  </>
                )}
              </div>

              {/* Fairways / GIR / penalties wrap onto their own line so nothing
                  scrolls at 400px (putts stays inline above, like v1). */}
              {(tracked.includes("penalties") || tracked.includes("fairways") || tracked.includes("gir")) && (
                <div className={styles.playerExtras}>
                  {tracked.includes("penalties") && (
                    <div className={styles.extraStat}>
                      <span className={styles.extraLabel}>Pen</span>
                      <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => bumpPenalties(p.id, -1)} disabled={cell.penalty_strokes != null && cell.penalty_strokes <= 0}><span className={styles.glyph}>−</span></button>
                      <span className={styles.extraVal}>{cell.penalty_strokes ?? "·"}</span>
                      <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => bumpPenalties(p.id, 1)}><span className={styles.glyph}>+</span></button>
                    </div>
                  )}
                  {tracked.includes("fairways") && (
                    <div className={styles.extraStat}>
                      <span className={styles.extraLabel}>Fwy</span>
                      <button type="button" className={styles.toggleBtn} data-state={cell.fairway_hit == null ? "none" : cell.fairway_hit ? "yes" : "no"} onClick={() => cycleBool(p.id, "fairway_hit")} disabled={hole.par < 4}>
                        {cell.fairway_hit == null ? "–" : cell.fairway_hit ? "✓" : "✗"}
                      </button>
                    </div>
                  )}
                  {tracked.includes("gir") && (
                    <div className={styles.extraStat}>
                      <span className={styles.extraLabel}>GIR</span>
                      <button type="button" className={styles.toggleBtn} data-state={cell.green_in_regulation == null ? "none" : cell.green_in_regulation ? "yes" : "no"} onClick={() => cycleBool(p.id, "green_in_regulation")}>
                        {cell.green_in_regulation == null ? "–" : cell.green_in_regulation ? "✓" : "✗"}
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {allComplete && status !== "completed" && (
          <button type="button" className={styles.completeBtn} onClick={() => setConfirmOpen(true)}>Complete round</button>
        )}
        {status === "completed" && (
          <button type="button" className={styles.completeBtn} onClick={close}>Done, back to My Rounds</button>
        )}

        {/* Configurable tracked stats */}
        <div className={styles.statsConfig}>
          <span className={styles.statsConfigLabel}>Track:</span>
          {ALL_STATS.map((s) => (
            <button key={s.key} type="button" className={styles.statChip} data-on={tracked.includes(s.key)} onClick={() => toggleTracked(s.key)}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Side-game standings (Skins, Nassau) — live, just above the chatter. */}
        <SideGameStandings
          games={gameList}
          playerNames={playerNames}
          holeNumbers={holeNumbers}
          gross={gross}
          strokesByPlayer={strokesByPlayer}
          roundId={roundId}
          rosterOrder={players.map((p) => p.id)}
          brandColor={brandColor}
          onGameSaved={(g) => setGameList((prev) => prev.map((x) => (x.id === g.id ? g : x)))}
          onGameRemoved={(id) => setGameList((prev) => prev.filter((x) => x.id !== id))}
        />

        {/* Live comments — the group chatters while scoring. */}
        <RoundComments roundId={roundId} viewerId={viewerId} orgId={orgId} />

        {/* Other groups out on this course right now, each expandable to its card. */}
        <OtherGroups roundId={roundId} />
      </div>

      {confirmOpen && (
        <div className={styles.modalOverlay} onClick={() => !completing && setConfirmOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalBody}>
              <h2 className={styles.modalTitle}>Complete round?</h2>
              <p className={styles.modalText}>Once completed, it&apos;s saved to your history and counted toward your handicap. You can reopen it later to fix something.</p>
              {completeErr && <p className={styles.modalErr}>{completeErr}</p>}
            </div>
            <div className={styles.modalActions}>
              <button type="button" className={styles.modalBtnPrimary} onClick={handleComplete} disabled={completing}>{completing ? "Completing…" : "Complete round"}</button>
              <button type="button" className={styles.modalBtnGhost} onClick={() => setConfirmOpen(false)} disabled={completing}>Keep editing</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
