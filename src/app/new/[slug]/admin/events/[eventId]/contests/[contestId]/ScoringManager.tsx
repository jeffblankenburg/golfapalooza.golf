"use client";

import { useMemo, useState } from "react";
import Modal from "@/app/new/_components/Modal";
import styles from "@/app/new/new.module.css";

export interface ScoreHole { hole_number: number; par: number; handicap_index: number }
export interface ScoreTeam { id: string; name: string | null; team_handicap: number | null; members: string[] }
interface ScoreRow { team_id: string; hole_number: number; strokes: number }
interface ObsRow { user_id: string; hole_number: number; metric: string; value: number }
interface PlayerObs { on_green: boolean; holed_out: boolean }

/**
 * Scramble scoring — review-first (#209). A list of groups with their round
 * summary; tapping a group expands an inline scorecard. Tapping a hole opens a
 * floating editor (team score stepper + each player's Green / Putt toggle) with
 * prev/next arrows. Optimistic: one hole saved per PUT in the background.
 */
export default function ScoringManager({
  orgId,
  eventId,
  contestId,
  holes,
  teams,
  initialScores,
  initialObs,
  names,
}: {
  orgId: string;
  eventId: string;
  contestId: string;
  holes: ScoreHole[];
  teams: ScoreTeam[];
  initialScores: ScoreRow[];
  initialObs: ObsRow[];
  names: Record<string, string>;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [scores, setScores] = useState<Record<string, Record<number, number>>>(() => {
    const m: Record<string, Record<number, number>> = {};
    for (const s of initialScores) (m[s.team_id] ||= {})[s.hole_number] = s.strokes;
    return m;
  });
  const [obs, setObs] = useState<Record<string, PlayerObs>>(() => {
    const m: Record<string, PlayerObs> = {};
    for (const o of initialObs) {
      const k = `${o.user_id}|${o.hole_number}`;
      const cur = m[k] || { on_green: false, holed_out: false };
      if (o.metric === "on_green") cur.on_green = o.value === 1;
      if (o.metric === "holed_out") cur.holed_out = o.value === 1;
      m[k] = cur;
    }
    return m;
  });
  const [editTeamId, setEditTeamId] = useState<string | null>(null);
  const [editHole, setEditHole] = useState<number | null>(null);
  const [wScore, setWScore] = useState<number | "">("");
  const [wPlayers, setWPlayers] = useState<Record<string, PlayerObs>>({});

  const lowestHcp = teams.length ? Math.min(...teams.map((t) => t.team_handicap ?? 0)) : 0;
  const holeByNum = useMemo(() => new Map(holes.map((h) => [h.hole_number, h])), [holes]);
  const holeNums = useMemo(() => holes.map((h) => h.hole_number).sort((a, b) => a - b), [holes]);
  const editTeam = teams.find((t) => t.id === editTeamId) || null;

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  function totals(t: ScoreTeam) {
    const sc = scores[t.id] || {};
    const played = holes.filter((h) => sc[h.hole_number] != null);
    const total = played.reduce((s, h) => s + sc[h.hole_number], 0);
    const parPlayed = played.reduce((s, h) => s + h.par, 0);
    const adj = Math.max(0, (t.team_handicap ?? 0) - lowestHcp);
    // Always compute — these are admin tools; a team that hasn't teed off shows
    // 0 gross, 0 thru, and its handicap-driven net (e.g. −2 for a 2-stroke team).
    return {
      thru: played.length,
      total,
      vsPar: total - parPlayed,
      net: total - adj,
      hdcp: adj,
    };
  }


  function openHole(teamId: string, n: number) {
    const t = teams.find((x) => x.id === teamId);
    if (!t) return;
    setWScore(scores[teamId]?.[n] ?? "");
    const pl: Record<string, PlayerObs> = {};
    for (const uid of t.members) pl[uid] = { ...(obs[`${uid}|${n}`] || { on_green: false, holed_out: false }) };
    setWPlayers(pl);
    setEditTeamId(teamId);
    setEditHole(n);
  }

  // Optimistic: commit the hole to local state immediately, save in the background.
  function commitHole(n: number) {
    const t = teams.find((x) => x.id === editTeamId);
    if (!t) return;
    const tid = t.id;
    const members = t.members;
    const strokes = wScore === "" ? null : Number(wScore);
    const players = wPlayers;

    setScores((prev) => {
      const row = { ...(prev[tid] || {}) };
      if (strokes == null) delete row[n]; else row[n] = strokes;
      return { ...prev, [tid]: row };
    });
    setObs((prev) => {
      const next = { ...prev };
      for (const uid of members) next[`${uid}|${n}`] = { ...(players[uid] || { on_green: false, holed_out: false }) };
      return next;
    });

    fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests/${contestId}/scores`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        team_id: tid,
        hole_number: n,
        strokes,
        observations: members.map((uid) => ({ user_id: uid, on_green: players[uid]?.on_green, holed_out: players[uid]?.holed_out })),
      }),
    }).catch(() => {});
  }

  function gotoHole(n: number) {
    if (editHole != null) commitHole(editHole);
    if (editTeamId) openHole(editTeamId, n);
  }
  function closeEditor() {
    if (editHole != null) commitHole(editHole);
    setEditHole(null);
    setEditTeamId(null);
  }

  const editPar = editHole != null ? holeByNum.get(editHole)?.par ?? 4 : 4;
  function incScore(d: number) {
    setWScore((v) => (v === "" ? editPar : Math.max(1, Math.min(20, v + d))));
  }
  function toggleGreen(uid: string) {
    setWPlayers((p) => ({ ...p, [uid]: { on_green: !p[uid]?.on_green, holed_out: p[uid]?.holed_out ?? false } }));
  }
  function toggleHoled(uid: string) {
    setWPlayers((p) => {
      const turningOn = !p[uid]?.holed_out;
      const next: Record<string, PlayerObs> = {};
      for (const m of editTeam?.members || []) next[m] = { on_green: p[m]?.on_green ?? false, holed_out: m === uid ? turningOn : false };
      return next;
    });
  }

  const scoreColor = (strokes: number | undefined, par: number) =>
    strokes == null ? undefined : strokes < par ? styles.cscUnder : strokes > par ? styles.cscOver : undefined;

  function nine(nums: number[], t: ScoreTeam, label: string) {
    const sc = scores[t.id] || {};
    const parSub = nums.reduce((s, n) => s + (holeByNum.get(n)?.par ?? 0), 0);
    const playedNums = nums.filter((n) => sc[n] != null);
    const scoreSub = playedNums.reduce((s, n) => s + sc[n], 0);
    return (
      <div className={styles.cscNineWrap}>
        <div className={styles.cscNine}>
          <div className={`${styles.cscHoleCol} ${styles.cscLabelCol}`}>
            <span className={styles.cscHoleNum}>Hole</span>
            <span className={styles.cscHolePar}>Par</span>
            <span className={styles.cscLabelScore} />
          </div>
          {nums.map((n) => {
            const par = holeByNum.get(n)?.par ?? 4;
            const val = sc[n];
            return (
              <button key={n} type="button" className={styles.cscHoleCol} onClick={() => openHole(t.id, n)}>
                <span className={styles.cscHoleNum}>{n}</span>
                <span className={styles.cscHolePar}>{par}</span>
                <span className={`${styles.cscHoleScore} ${scoreColor(val, par) || ""}`} data-empty={val == null || undefined}>{val ?? ""}</span>
              </button>
            );
          })}
          <div className={`${styles.cscHoleCol} ${styles.cscHoleColSum}`}>
            <span className={styles.cscHoleNum}>{label}</span>
            <span className={styles.cscHolePar}>{parSub}</span>
            <span className={styles.cscHoleScore}>{playedNums.length ? scoreSub : ""}</span>
          </div>
        </div>
      </div>
    );
  }

  // v1-style score math at the bottom of an open scorecard: OUT + IN = TOT − HDCP = NET.
  function mathRow(t: ScoreTeam) {
    const sc = scores[t.id] || {};
    const out = front.reduce((s, n) => s + (sc[n] ?? 0), 0);
    const inn = back.reduce((s, n) => s + (sc[n] ?? 0), 0);
    const tot = out + inn;
    const adj = Math.max(0, (t.team_handicap ?? 0) - lowestHcp);
    const net = tot - adj;
    const stat = (label: string, value: number, strong = false) => (
      <span className={styles.cscStat}>
        <span className={styles.cscStatLabel}>{label}</span>
        <span className={strong ? styles.cscStatValStrong : styles.cscStatVal}>{value}</span>
      </span>
    );
    return (
      <div className={styles.cscMath}>
        {stat("OUT", out)}
        <span className={styles.cscOp}>+</span>
        {stat("IN", inn)}
        <span className={styles.cscOp}>=</span>
        {stat("TOT", tot)}
        <span className={styles.cscOp}>−</span>
        {stat("HDCP", adj)}
        <span className={styles.cscOp}>=</span>
        {stat("NET", net, true)}
      </div>
    );
  }

  const front = holeNums.filter((n) => n <= 9);
  const back = holeNums.filter((n) => n >= 10);

  if (teams.length === 0) return <p className={styles.dnsHint} style={{ marginTop: 16 }}>Build teams first, then score here.</p>;
  if (holes.length === 0) return <p className={styles.dnsHint} style={{ marginTop: 16 }}>Set a course + tee in settings to score (needed for par).</p>;

  return (
    <div className={styles.cscoring}>
      <div className={styles.cscAllList}>
        {teams.map((t, i) => {
          const open = expanded.has(t.id);
          const tot = totals(t);
          const thruLabel = tot.thru === holes.length ? "F" : String(tot.thru);
          return (
            <div key={t.id} className={styles.cscAcc} data-open={open || undefined}>
              <button type="button" className={styles.cscAccHead} onClick={() => toggleExpand(t.id)} aria-expanded={open}>
                <span className={styles.cscAllMain}>
                  <span className={styles.cscAllName}>{t.name || `Team ${i + 1}`} <span className={styles.cscThru}>({thruLabel})</span></span>
                  {t.members.length > 0 && (
                    <span className={styles.cscAllPlayers}>{t.members.map((uid) => names[uid] || "Member").join(", ")}</span>
                  )}
                </span>
                <span className={styles.cscAllScore}>
                  <span className={styles.cscAllScoreLabel}>Net</span>
                  <span className={styles.cscAllScoreNum}>{tot.net}</span>
                  <span className={styles.cscAllScoreSub}>{tot.total} gross, {tot.hdcp} hdcp</span>
                </span>
                <svg className={styles.cscAccChevron} data-open={open || undefined} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {open && (
                <div className={styles.cscAccBody}>
                  {nine(front, t, "OUT")}
                  {back.length > 0 && nine(back, t, "IN")}
                  {mathRow(t)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Per-hole editor */}
      <Modal open={editHole != null} title={editHole != null ? `Hole ${editHole}, Par ${editPar}` : ""} onClose={closeEditor}>
        {editHole != null && editTeam && (
          <div className={styles.cscEditor}>
            <div className={styles.cscStepper}>
              <span className={styles.teamMetaLabel}>Team score</span>
              <button type="button" className={styles.stepBtn} data-kind="strokes" onClick={() => incScore(-1)} aria-label="Lower"><span className={styles.stepGlyph}>−</span></button>
              <span className={styles.cscStepperVal}>{wScore === "" ? "-" : wScore}</span>
              <button type="button" className={styles.stepBtn} data-kind="strokes" onClick={() => incScore(1)} aria-label="Higher"><span className={styles.stepGlyph}>+</span></button>
              {wScore !== "" && <button type="button" className={styles.cscClear} onClick={() => setWScore("")}>Clear</button>}
            </div>

            <div className={styles.cscPlayers}>
              {editTeam.members.map((uid) => (
                <div key={uid} className={styles.cscPlayerRow}>
                  <span className={styles.cscPlayerName}>{names[uid] || "Member"}</span>
                  <button type="button" className={styles.cscToggle} data-on={wPlayers[uid]?.on_green || undefined} onClick={() => toggleGreen(uid)}>Green</button>
                  <button type="button" className={styles.cscToggle} data-on={wPlayers[uid]?.holed_out || undefined} onClick={() => toggleHoled(uid)}>Putt</button>
                </div>
              ))}
            </div>

            <div className={styles.cscNav}>
              <button type="button" className={styles.cscNavBtn} disabled={holeNums.indexOf(editHole) <= 0} onClick={() => gotoHole(holeNums[holeNums.indexOf(editHole) - 1])}>‹ Prev</button>
              <button type="button" className={styles.cscNavBtn} disabled={holeNums.indexOf(editHole) >= holeNums.length - 1} onClick={() => gotoHole(holeNums[holeNums.indexOf(editHole) + 1])}>Next ›</button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
