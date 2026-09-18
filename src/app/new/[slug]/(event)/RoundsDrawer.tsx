"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";
import RoundDetail from "./RoundDetail";
import RoundForm from "./RoundForm";

interface RoundSummary {
  id: string;
  round_date: string;
  round_type: "18" | "9-front" | "9-back";
  format: "individual" | "scramble";
  status: "in_progress" | "completed" | "abandoned";
  course_name: string;
  course_city: string | null;
  course_state: string | null;
  tee_name: string;
  tee_color: string | null;
  tee_gender: string | null;
  par: number;
  final_score: number | null;
  score_to_par: number | null;
  score_differential: number | null;
  is_incomplete: boolean;
  holes_played: number;
  expected_holes: number;
}

interface RoundsPayload {
  handicapIndex: number | null;
  stats: { roundsCounted: number; avgScore: number | null; bestScore: number | null };
  rounds: RoundSummary[];
}

function toParLabel(n: number): string {
  if (n === 0) return "E";
  return n > 0 ? `+${n}` : `−${Math.abs(n)}`; // proper minus sign
}

function typeLabel(t: RoundSummary["round_type"]): string {
  return t === "9-front" ? "Front 9" : t === "9-back" ? "Back 9" : "18";
}

function shortDate(iso: string): { mon: string; day: string; year: string } {
  // iso is a DATE (YYYY-MM-DD); parse as local, not UTC, to avoid off-by-one.
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  return {
    mon: dt.toLocaleDateString("en-US", { month: "short" }),
    day: String(dt.getDate()),
    year: String(y),
  };
}

/**
 * My Rounds drawer — the golfer's personal scoring home. Reads-only for now:
 * handicap + score stats + the list of logged rounds (personal & global, shared
 * across every group). Logging + live scoring + the round detail view land next.
 */
export default function RoundsDrawer({
  active,
  orgId,
  formOpen,
  onExitForm,
  onCloseDrawer,
}: {
  active: boolean;
  orgId: string;
  formOpen: boolean;
  onExitForm: () => void;
  onCloseDrawer: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const [data, setData] = useState<RoundsPayload | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/v2/rounds");
        const d = res.ok ? ((await res.json()) as RoundsPayload) : null;
        if (!cancelled && d) setData(d);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, reload]);

  // The header +/× (EventShell) controls the log-a-round form.
  if (formOpen) {
    return (
      <RoundForm
        orgId={orgId}
        onDone={() => {
          setReload((n) => n + 1);
          onExitForm();
        }}
        onCloseDrawer={onCloseDrawer}
      />
    );
  }

  if (!loaded) return <p className={styles.drawerStub}>Loading…</p>;

  const rounds = data?.rounds ?? [];
  const stats = data?.stats ?? { roundsCounted: 0, avgScore: null, bestScore: null };
  const hcp = data?.handicapIndex ?? null;

  return (
    <div className={styles.roundsWrap}>
      {stats.roundsCounted > 0 && (
        <div className={styles.roundsStats}>
          <div className={styles.roundStat} data-accent="hcp">
            <span className={styles.roundStatLabel}>HCP</span>
            <span className={styles.roundStatValue}>{hcp != null ? hcp.toFixed(1) : "—"}</span>
          </div>
          <div className={styles.roundStat}>
            <span className={styles.roundStatLabel}>Rounds</span>
            <span className={styles.roundStatValue}>{stats.roundsCounted}</span>
          </div>
          <div className={styles.roundStat}>
            <span className={styles.roundStatLabel}>Average</span>
            <span className={styles.roundStatValue}>{stats.avgScore ?? "—"}</span>
          </div>
          <div className={styles.roundStat} data-accent="best">
            <span className={styles.roundStatLabel}>Best 18</span>
            <span className={styles.roundStatValue}>{stats.bestScore ?? "—"}</span>
          </div>
        </div>
      )}

      {rounds.length === 0 ? (
        <div className={styles.roundsEmpty}>
          <span className={styles.roundsEmptyIcon} aria-hidden>
            <svg width="26" height="26" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M6 21V3M6 4h11l-2.5 3L17 10H6" />
            </svg>
          </span>
          <span className={styles.roundsEmptyTitle}>No rounds logged yet</span>
          <span className={styles.roundsEmptySub}>Log your rounds to track scores and your handicap here.</span>
        </div>
      ) : (
        <div className={styles.roundList}>
          {rounds.map((r) => {
            const { mon, day, year } = shortDate(r.round_date);
            const isOpen = openId === r.id;
            return (
              <div key={r.id} className={styles.roundItem} data-open={isOpen || undefined}>
                <button
                  type="button"
                  className={styles.roundRow}
                  aria-expanded={isOpen}
                  onClick={() => setOpenId(isOpen ? null : r.id)}
                >
                  <div className={styles.roundDate}>
                    <span className={styles.roundDateMon}>{mon}</span>
                    <span className={styles.roundDateDay}>{day}</span>
                    <span className={styles.roundDateMon}>{year}</span>
                  </div>
                  <div className={styles.roundInfo}>
                    <span className={styles.roundCourse}>{r.course_name}</span>
                    <span className={styles.roundBadges}>
                      <span className={styles.roundBadge}>{typeLabel(r.round_type)}</span>
                      {r.format === "scramble" && <span className={styles.roundBadge}>Scramble</span>}
                      {r.status === "in_progress" && <span className={styles.roundBadge} data-live>In progress</span>}
                      {r.is_incomplete && (
                        <span className={styles.roundBadge} data-warn>
                          Incomplete · {r.holes_played}/{r.expected_holes}
                        </span>
                      )}
                      {r.tee_name && (
                        <span className={styles.roundTee}>
                          {r.tee_name}
                          {r.tee_gender === "women" ? " (W)" : ""}
                        </span>
                      )}
                    </span>
                  </div>
                  <div className={styles.roundScore}>
                    {r.final_score != null ? (
                      <>
                        <span className={styles.roundScoreNum}>{r.final_score}</span>
                        {r.score_to_par != null && (
                          <span
                            className={styles.roundToPar}
                            data-sign={r.score_to_par < 0 ? "under" : r.score_to_par > 0 ? "over" : "even"}
                          >
                            {toParLabel(r.score_to_par)}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className={styles.roundScoreDash}>—</span>
                    )}
                  </div>
                  <svg className={styles.roundChev} width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
                    <path d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {isOpen && <RoundDetail id={r.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
