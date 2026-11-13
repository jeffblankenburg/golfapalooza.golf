"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { THREES_EVENTS, andOneResolvers, currentStreak, type ThreesTeam } from "@/lib/v2/contests/threes";
import type { ThreesState } from "@/lib/v2/contests/threes-server";
import { subscribeToThrees } from "@/lib/v2/realtime/threes-channel";
import styles from "./threes.module.css";
/* eslint-disable @next/next/no-img-element */

export default function ThreesRecorder({
  slug,
  apiBase,
  state,
  backHref,
}: {
  slug: string;
  apiBase: string;
  state: ThreesState;
  backHref: string;
}) {
  const router = useRouter();
  const { game } = state;
  const [team, setTeam] = useState<ThreesTeam>("a");
  const [busy, setBusy] = useState(false);
  const boardHref = `/new/${slug}/admin/contests/${state.contest.id}/board`;

  // Keep the console live (another device or the board poll) and never stale.
  useEffect(() => {
    const unsub = subscribeToThrees(state.contest.id, () => router.refresh());
    const iv = setInterval(() => router.refresh(), 5000);
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, [state.contest.id, router]);

  async function post(body: Record<string, unknown>) {
    setBusy(true);
    try {
      await fetch(`${apiBase}/threes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  if (!game) {
    return (
      <div className={styles.recorder}>
        <Link href={backHref} className={styles.back}>← Back</Link>
        <p className={styles.muted}>No game set yet. Pick one on the manage page first.</p>
      </div>
    );
  }

  const streak = currentStreak(state.events, state.streakCap);
  const runTeam = streak.side ? (streak.side === "a" ? game.teamA : game.teamB) : null;
  const last = state.events[state.events.length - 1];
  // A pending And-1 locks the console to that team and leaves only the resolving
  // plays (3-/4-point play) and the dismiss button active.
  const pending = state.andOne;
  const activeTeam: ThreesTeam = pending ? pending.team : team;
  const active = activeTeam === "a" ? game.teamA : game.teamB;

  return (
    <div className={styles.recorder}>
      <div className={styles.recorderTop}>
        <Link href={backHref} className={styles.back}>← Back</Link>
        <div className={styles.recorderTally}>
          {runTeam ? (
            <span><strong>{runTeam.abbrev || runTeam.name}</strong> on a {streak.value} run 🔥</span>
          ) : (
            <span>No streak</span>
          )}
        </div>
        <a href={boardHref} target="_blank" rel="noopener" className={styles.secondaryBtn}>Board ↗</a>
      </div>

      {/* Which team executed the play (locked while an And-1 is pending) */}
      <div className={styles.teamToggle}>
        {(["a", "b"] as ThreesTeam[]).map((t) => {
          const tm = t === "a" ? game.teamA : game.teamB;
          const on = activeTeam === t;
          return (
            <button
              key={t}
              type="button"
              className={styles.teamBtn}
              data-on={on || undefined}
              disabled={!!pending && !on}
              style={on && tm.color ? { borderColor: tm.color, background: tm.color } : undefined}
              onClick={() => { if (!pending) setTeam(t); }}
            >
              {tm.logo && <img src={tm.logo} alt="" className={styles.teamBtnLogo} />}
              <span className={styles.teamBtnName}>{tm.shortName}</span>
            </button>
          );
        })}
      </div>

      <p className={styles.scoringFor}>
        {pending ? (
          <>Waiting on the <strong>And 1</strong> free throw for <strong>{active.shortName}</strong> (potential {pending.potential})</>
        ) : (
          <>Scoring for <strong>{active.shortName}</strong></>
        )}
      </p>

      {/* And 1 — a non-scoring pending state. Pick the potential (3 or 4) so the
          board can show it; while pending the button dismisses it. */}
      {pending ? (
        <button
          type="button"
          className={styles.andOneBtn}
          data-on
          disabled={busy}
          onClick={() => void post({ action: "and_one", team: null })}
        >
          ✕ Dismiss And 1
        </button>
      ) : (
        <div className={styles.andOneRow}>
          <button type="button" className={styles.andOneBtn} disabled={busy} onClick={() => void post({ action: "and_one", team: activeTeam, potential: 3 })}>
            🏀 And 1 (potential 3)
          </button>
          <button type="button" className={styles.andOneBtn} disabled={busy} onClick={() => void post({ action: "and_one", team: activeTeam, potential: 4 })}>
            🏀 And 1 (potential 4)
          </button>
        </div>
      )}

      {/* Event buttons — while an And-1 is pending, only its resolving play is live */}
      <div className={styles.eventGrid}>
        {THREES_EVENTS.map((e) => {
          const isResolver = !!pending && andOneResolvers(pending.potential).includes(e.key);
          const locked = !!pending && !isResolver;
          return (
            <button
              key={e.key}
              type="button"
              className={styles.eventBtn}
              data-owe={e.result === "owe" || undefined}
              data-resolver={isResolver || undefined}
              disabled={busy || locked}
              onClick={() => void post({ action: "log_event", team: activeTeam, event: e.key })}
            >
              <span className={styles.eventLabel}>{e.label}</span>
              <span className={styles.eventVal}>{e.result === "win" ? "+" : "−"}{e.points}</span>
            </button>
          );
        })}
      </div>

      <div className={styles.recorderActions}>
        <span className={styles.lastEvent}>
          {last ? `Last: ${(last.team === "a" ? game.teamA : game.teamB).abbrev || (last.team === "a" ? game.teamA : game.teamB).name} ${last.event_type.replace(/_/g, " ")}` : "No events yet"}
        </span>
        <button type="button" className={styles.undoBtn} disabled={busy || state.events.length === 0} onClick={() => void post({ action: "undo" })}>
          Undo last
        </button>
      </div>
    </div>
  );
}
