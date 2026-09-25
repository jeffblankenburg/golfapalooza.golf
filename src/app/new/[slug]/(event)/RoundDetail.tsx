"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import { useNameMode } from "./NameMode";
import { pickName, type NameMode } from "@/lib/v2/profile";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import RoundComments from "@/app/new/[slug]/rounds/[id]/score/RoundComments";
import ShareRoundButton from "./ShareRoundButton";
import RoundScorecard, { type SCPlayer } from "./RoundScorecard";
import SideGameStandings, { type RoundGame } from "@/app/new/[slug]/rounds/[id]/score/SideGameStandings";

interface Hole {
  hole_number: number;
  par: number;
  handicap_index: number;
  yards: number | null;
}
interface PlayerStats {
  putts: number | null;
  fairways: { hit: number; of: number } | null;
  gir: { hit: number; of: number } | null;
  penalties: number | null;
}
interface PlayerRow {
  id: string;
  is_viewer: boolean;
  is_guest: boolean;
  guest_name: string | null;
  tee_color: string | null;
  profile: { display_name: string; first_name: string | null; last_name: string | null; nickname: string | null; avatar_url: string | null } | null;
  gross: number | null;
  to_par: number | null;
  scores: Record<number, number>;
  stats: PlayerStats;
}
interface Detail {
  id: string;
  status: "in_progress" | "completed" | "abandoned";
  round_type: "18" | "9-front" | "9-back";
  format: "individual" | "scramble";
  course_name: string;
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
  games: RoundGame[];
  strokes_by_player: Record<string, Record<number, number>>;
}
function shortLabel(p: PlayerRow, mode: NameMode): string {
  if (p.is_viewer) return "You";
  const full = p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player";
  const first = full.trim().split(/\s+/)[0] || full;
  return first.length > 8 ? first.slice(0, 8) : first;
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

  // A completed round shared with other Loozers only removes YOUR score; an
  // in-progress or solo round deletes wholesale. Mirror the server rule so the
  // confirm text is honest about what will happen.
  const otherLoozers = d.players.filter((p) => !p.is_viewer && !p.is_guest);
  const wholeDelete = d.status === "in_progress" || otherLoozers.length === 0;
  const deleteMessage = wholeDelete
    ? "This permanently removes the round and all its scores for everyone. If it counted toward handicaps, they'll be recalculated. This can't be undone."
    : "This removes only your score from this round. The other players keep theirs, and your handicap will be recalculated. This can't be undone.";

  const isScramble = d.format === "scramble";

  // Names/labels resolved here (name-mode context) so RoundScorecard stays pure.
  const scPlayers: SCPlayer[] = d.players.map((p) => ({
    name: p.is_viewer ? "You" : p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player",
    shortLabel: shortLabel(p, mode),
    is_viewer: p.is_viewer,
    is_guest: p.is_guest,
    tee_color: p.tee_color,
    gross: p.gross,
    to_par: p.to_par,
    scores: p.scores,
    stats: p.stats,
  }));

  // Side-game results (read-only). Keyed by round_player id, real names (not "You").
  const gameNameById: Record<string, string> = {};
  const grossById: Record<string, Record<number, number>> = {};
  for (const p of d.players) {
    gameNameById[p.id] = p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player";
    grossById[p.id] = p.scores;
  }
  const parByHole = Object.fromEntries(d.holes.map((h) => [h.hole_number, h.par]));

  // Who was on the scramble team (the shared ball is one score, but list the members).
  const teamNames = isScramble
    ? d.players.map((p) => {
        const n = p.is_guest ? p.guest_name || "Guest" : p.profile ? pickName(p.profile, mode) : "Player";
        return p.is_guest ? `${n} (guest)` : n;
      })
    : [];

  return (
    <div className={styles.roundBody}>
      {d.status === "in_progress" && d.can_manage && (
        <button type="button" className={styles.roundResumeBtn} onClick={onResume} style={{ marginBottom: 12 }}>
          Resume scoring
        </button>
      )}
      <RoundScorecard
        holes={d.holes}
        players={scPlayers}
        roundType={d.round_type}
        isScramble={isScramble}
        teamNames={teamNames}
      />

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

      {/* Side-game results — read-only final standings + settlement. */}
      {d.games && d.games.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <SideGameStandings
            games={d.games}
            playerNames={gameNameById}
            holeNumbers={d.holes.map((h) => h.hole_number)}
            gross={grossById}
            strokesByPlayer={d.strokes_by_player}
            parByHole={parByHole}
            roundId={d.id}
            rosterOrder={d.players.map((p) => p.id)}
            readOnly
          />
        </div>
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

      {d.status === "completed" && (
        <div style={{ marginTop: 4, marginBottom: d.can_manage ? 10 : 0 }}>
          <ShareRoundButton roundId={id} courseName={d.course_name} />
        </div>
      )}

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
