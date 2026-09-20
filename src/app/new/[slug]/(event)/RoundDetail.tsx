"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import { useNameMode } from "./NameMode";
import { pickName, type NameMode } from "@/lib/v2/profile";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import RoundComments from "@/app/new/[slug]/rounds/[id]/score/RoundComments";

interface Hole {
  hole_number: number;
  par: number;
  handicap_index: number;
}
interface PlayerRow {
  is_viewer: boolean;
  is_guest: boolean;
  guest_name: string | null;
  profile: { display_name: string; first_name: string | null; last_name: string | null; nickname: string | null; avatar_url: string | null } | null;
  gross: number | null;
  to_par: number | null;
  scores: Record<number, number>;
}
interface Detail {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  round_type: "18" | "9-front" | "9-back";
  format: "individual" | "scramble";
  tee_name: string;
  tee_color: string | null;
  tee_gender: string | null;
  course_rating: number | null;
  slope_rating: number | null;
  gross: number | null;
  adjusted: number | null;
  differential: number | null;
  to_par: number | null;
  is_incomplete: boolean;
  holes_played: number;
  expected_holes: number;
  comment_count: number;
  can_manage: boolean;
  holes: Hole[];
  players: PlayerRow[];
}
interface LabeledPlayer extends PlayerRow {
  label: string;
}

function toParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`;
}

/** Golf scorecard mark for a hole score relative to par. */
function mark(strokes: number | null, par: number): string {
  if (strokes == null) return "none";
  const d = strokes - par;
  if (d <= -2) return "eagle";
  if (d === -1) return "birdie";
  if (d === 0) return "par";
  if (d === 1) return "bogey";
  return "double";
}

function shortLabel(p: PlayerRow, mode: NameMode): string {
  if (p.is_viewer) return "You";
  const full = p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player";
  const first = full.trim().split(/\s+/)[0] || full;
  return first.length > 8 ? first.slice(0, 8) : first;
}

function Nine({ holes, players, totalLabel }: { holes: Hole[]; players: LabeledPlayer[]; totalLabel: string }) {
  const outPar = holes.reduce((s, h) => s + h.par, 0);
  return (
    <div className={styles.scNine}>
      <div className={styles.scRow}>
        <span className={styles.scRowLabel}>Hole</span>
        {holes.map((h) => (
          <span key={h.hole_number} className={styles.scHead}>{h.hole_number}</span>
        ))}
        <span className={styles.scHead} data-total>{totalLabel}</span>
      </div>
      <div className={styles.scRow}>
        <span className={styles.scRowLabel}>Par</span>
        {holes.map((h) => (
          <span key={h.hole_number} className={styles.scPar}>{h.par}</span>
        ))}
        <span className={styles.scPar} data-total>{outPar}</span>
      </div>
      <div className={styles.scRow}>
        <span className={styles.scRowLabel}>Hcp</span>
        {holes.map((h) => (
          <span key={h.hole_number} className={styles.scHcp}>{h.handicap_index}</span>
        ))}
        <span className={styles.scHcp} data-total />
      </div>
      {players.map((pl, i) => {
        const played = holes.filter((h) => pl.scores[h.hole_number] != null);
        const outScore = played.length ? played.reduce((s, h) => s + pl.scores[h.hole_number], 0) : null;
        return (
          <div key={i} className={styles.scScoreRow} data-viewer={pl.is_viewer || undefined}>
            <span className={styles.scNameLabel}>{pl.label}</span>
            {holes.map((h) => {
              const st = pl.scores[h.hole_number] ?? null;
              return (
                <span key={h.hole_number} className={styles.scCell}>
                  <span className={styles.scMark} data-mark={mark(st, h.par)} data-two={st != null && st >= 10 ? "" : undefined}>
                    <span className={styles.scNum}>{st ?? "·"}</span>
                  </span>
                </span>
              );
            })}
            <span className={styles.scCell} data-total>
              <span className={styles.scTotalNum}>{outScore ?? "·"}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A round's scorecard, rendered INLINE inside its accordion row. Shows a shared
 * Hole / Par / Hcp header plus every player's hole-by-hole scores; the viewer's
 * row is subtly highlighted. Lazy-fetches on first expand.
 */
export default function RoundDetail({
  id,
  orgId,
  viewerId,
  onResume,
  onDeleted,
  defaultCommentsOpen = false,
}: {
  id: string;
  orgId: string;
  viewerId: string;
  onResume?: () => void;
  onDeleted?: () => void;
  defaultCommentsOpen?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [d, setD] = useState<Detail | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(defaultCommentsOpen);
  const mode = useNameMode();

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v2/rounds/${id}`, { method: "DELETE" });
      if (res.ok) {
        setConfirmOpen(false);
        onDeleted?.();
      } else {
        setDeleting(false);
      }
    } catch {
      setDeleting(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v2/rounds/${id}`);
        const data = res.ok ? ((await res.json()) as Detail) : null;
        if (!cancelled) setD(data);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!loaded) return <div className={styles.roundBody}><p className={styles.drawerStub}>Loading…</p></div>;
  if (!d) return <div className={styles.roundBody}><p className={styles.drawerStub}>Couldn&apos;t load this round.</p></div>;

  const labeled: LabeledPlayer[] = d.players.map((p) => ({ ...p, label: shortLabel(p, mode) }));
  const front = d.holes.filter((h) => h.hole_number <= 9);
  const back = d.holes.filter((h) => h.hole_number >= 10);

  // A completed round shared with other Loozers only removes YOUR score; an
  // in-progress or solo round deletes wholesale. Mirror the server rule so the
  // confirm text is honest about what will happen.
  const otherLoozers = d.players.filter((p) => !p.is_viewer && !p.is_guest);
  const wholeDelete = d.status === "in_progress" || otherLoozers.length === 0;
  const deleteMessage = wholeDelete
    ? "This permanently removes the round and all its scores for everyone. If it counted toward handicaps, they'll be recalculated. This can't be undone."
    : "This removes only your score from this round — the other players keep theirs, and your handicap will be recalculated. This can't be undone.";
  const ratingLine =
    d.course_rating != null && d.slope_rating != null
      ? `${d.course_rating.toFixed(1)}/${d.slope_rating}`
      : null;

  // Scramble = one team ball. Every roster row carries the SAME score, so show a
  // single "Team" row (not one per player) on both the scorecard and the totals.
  const isScramble = d.format === "scramble";
  const teamRow: LabeledPlayer | null =
    isScramble && d.players[0]
      ? { ...d.players[0], is_viewer: false, is_guest: false, guest_name: null, profile: null, label: "Team" }
      : null;
  const scorecardPlayers = isScramble ? (teamRow ? [teamRow] : []) : labeled;

  // Who was on the scramble team (the shared ball is one score, but list the members).
  const teamNames = isScramble
    ? d.players.map((p) => {
        const n = p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player";
        return p.is_guest ? `${n} (guest)` : n;
      })
    : [];

  const totalRows = isScramble
    ? teamRow
      ? [{ name: "Team", isViewer: false, isGuest: false, gross: teamRow.gross, toPar: teamRow.to_par }]
      : []
    : d.players.map((p) => ({
        name: p.is_viewer ? "You" : p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player",
        isViewer: p.is_viewer,
        isGuest: p.is_guest,
        gross: p.gross,
        toPar: p.to_par,
      }));

  return (
    <div className={styles.roundBody}>
      {d.status === "in_progress" && d.can_manage && (
        <button type="button" className={styles.roundResumeBtn} onClick={onResume} style={{ marginBottom: 12 }}>
          Resume scoring
        </button>
      )}
      {(d.tee_name || ratingLine) && (
        <p className={styles.roundBodyMeta}>
          {d.tee_name ? `${d.tee_name}${d.tee_gender === "women" ? " (Women's)" : ""} tees` : ""}
          {d.tee_name && ratingLine ? " — " : ""}
          {ratingLine || ""}
        </p>
      )}

      {d.holes.length > 0 ? (
        <div className={styles.scCard}>
          {front.length > 0 && <Nine holes={front} players={scorecardPlayers} totalLabel={d.round_type === "18" ? "Out" : "Tot"} />}
          {back.length > 0 && <Nine holes={back} players={scorecardPlayers} totalLabel={d.round_type === "18" ? "In" : "Tot"} />}
        </div>
      ) : (
        <p className={styles.scQuickNote}>Quick entry — gross score only, no hole-by-hole card.</p>
      )}

      {/* Totals — a single Team row for scrambles, else gross + to-par per player. */}
      <div className={styles.scPlayers}>
        <p className={styles.scPlayersLabel}>{isScramble ? "Team score" : "Totals"}</p>
        {totalRows.map((row, i) => (
          <div key={i} className={styles.scPlayerRow} data-viewer={row.isViewer || undefined}>
            <span className={styles.scPlayerName}>
              {row.name}
              {row.isGuest && <span className={styles.scGuestTag}>guest</span>}
            </span>
            <span className={styles.scPlayerTotals}>
              <span className={styles.scPlayerGross}>{row.gross ?? "—"}</span>
              {row.toPar != null && (
                <span className={styles.scPlayerPar} data-sign={row.toPar < 0 ? "under" : row.toPar > 0 ? "over" : "even"}>
                  {toParLabel(row.toPar)}
                </span>
              )}
            </span>
          </div>
        ))}
        {teamNames.length > 0 && <p className={styles.scTeamNames}>{teamNames.join(", ")}</p>}
      </div>

      {/* Your handicap detail (viewer-specific). */}
      {(d.adjusted != null || d.differential != null) && (
        <div className={styles.scTotals}>
          {d.adjusted != null && (
            <div className={styles.scTotal}>
              <span className={styles.scTotalLabel}>Adjusted</span>
              <span className={styles.scTotalValue}>{d.adjusted}</span>
            </div>
          )}
          {d.differential != null && (
            <div className={styles.scTotal}>
              <span className={styles.scTotalLabel}>Differential</span>
              <span className={styles.scTotalValue}>{d.differential.toFixed(1)}</span>
            </div>
          )}
        </div>
      )}

      {d.is_incomplete && (
        <p className={styles.scIncomplete}>
          Incomplete round — {d.holes_played} of {d.expected_holes} holes. Excluded from your stats and handicap.
        </p>
      )}

      {/* Comments — collapsed by default (opens automatically via a notification
          deep-link, which passes defaultCommentsOpen). */}
      <div className={styles.roundCommentsSection}>
        {commentsOpen ? (
          <RoundComments roundId={id} viewerId={viewerId} orgId={orgId} />
        ) : (
          <button type="button" className={styles.roundCommentsToggle} onClick={() => setCommentsOpen(true)}>
            <span>Comments{d.comment_count > 0 ? ` (${d.comment_count})` : ""}</span>
            <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden><path d="M19 9l-7 7-7-7" /></svg>
          </button>
        )}
      </div>

      {d.can_manage && (
        <div className={styles.roundActions}>
          <button type="button" className={styles.roundDeleteBtn} onClick={() => setConfirmOpen(true)}>
            Delete round
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title="Delete this round?"
        message={deleteMessage}
        confirmLabel={deleting ? "Deleting…" : "Delete round"}
        destructive
        onConfirm={handleDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </div>
  );
}
