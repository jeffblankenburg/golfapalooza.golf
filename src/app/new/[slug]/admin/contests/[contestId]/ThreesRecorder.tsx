"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { THREES_EVENTS, currentStreak, type ThreesTeam } from "@/lib/v2/contests/threes";
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
  const active = team === "a" ? game.teamA : game.teamB;

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

      {/* Which team executed the play */}
      <div className={styles.teamToggle}>
        {(["a", "b"] as ThreesTeam[]).map((t) => {
          const tm = t === "a" ? game.teamA : game.teamB;
          const on = team === t;
          return (
            <button
              key={t}
              type="button"
              className={styles.teamBtn}
              data-on={on || undefined}
              style={on && tm.color ? { borderColor: tm.color, background: tm.color } : undefined}
              onClick={() => setTeam(t)}
            >
              {tm.logo && <img src={tm.logo} alt="" className={styles.teamBtnLogo} />}
              <span className={styles.teamBtnName}>{tm.shortName}</span>
            </button>
          );
        })}
      </div>

      <p className={styles.scoringFor}>
        Scoring for <strong>{active.shortName}</strong>
      </p>

      {/* Event buttons */}
      <div className={styles.eventGrid}>
        {THREES_EVENTS.map((e) => (
          <button
            key={e.key}
            type="button"
            className={styles.eventBtn}
            data-owe={e.result === "owe" || undefined}
            disabled={busy}
            onClick={() => void post({ action: "log_event", team, event: e.key })}
          >
            <span className={styles.eventLabel}>{e.label}</span>
            <span className={styles.eventVal}>{e.result === "win" ? "+" : "−"}{e.points}X</span>
          </button>
        ))}
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
