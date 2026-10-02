"use client";

import { useMemo, useRef, useState } from "react";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

export interface Participant {
  user_id: string;
  display_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  handicap_index: number | null;
}
export interface TeamData {
  id: string;
  name: string | null;
  team_handicap: number | null;
  tee_time: string | null;
  members: string[];
}
interface LocalTeam {
  key: string;
  name: string;
  handicap: number | null;
  tee_time: string; // HH:MM
  members: string[];
}
interface HcpBreakdown {
  team_handicap: number;
  members: { user_id: string; handicap_index: number | null; course_handicap: number; weight: number; contribution: number }[];
}

const SIZES = [2, 3, 4];

export default function TeamsManager({
  orgId,
  eventId,
  contestId,
  participants,
  initialTeams,
  contestStartTime,
}: {
  orgId: string;
  eventId: string;
  contestId: string;
  participants: Participant[];
  initialTeams: TeamData[];
  contestStartTime: string | null;
}) {
  const keySeq = useRef(0);
  const nextKey = () => `t${keySeq.current++}`;
  const startHHMM = contestStartTime ? contestStartTime.slice(0, 5) : "";

  const [teams, setTeams] = useState<LocalTeam[]>(() =>
    initialTeams.map((t) => ({
      key: nextKey(),
      name: t.name || "",
      handicap: t.team_handicap,
      tee_time: t.tee_time ? t.tee_time.slice(0, 5) : "",
      members: [...t.members],
    })),
  );
  const [teamSize, setTeamSize] = useState(4);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calcBusy, setCalcBusy] = useState(false);
  const [missingCount, setMissingCount] = useState(0);
  const [breakdowns, setBreakdowns] = useState<Record<string, HcpBreakdown>>({});
  const [calcTeeName, setCalcTeeName] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [confirmGen, setConfirmGen] = useState(false);

  const profileById = useMemo(() => new Map(participants.map((p) => [p.user_id, p])), [participants]);
  const name = (uid: string) => {
    const p = profileById.get(uid);
    return p ? p.display_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Member" : "Member";
  };
  const hcp = (uid: string) => profileById.get(uid)?.handicap_index ?? null;
  const hcpBadge = (uid: string) => {
    const h = hcp(uid);
    return h == null ? null : <span className={styles.chipHcp}>{h.toFixed(1)}</span>;
  };
  const assigned = useMemo(() => new Set(teams.flatMap((t) => t.members)), [teams]);
  const unassigned = participants.filter((p) => !assigned.has(p.user_id));

  const selectedIds = useMemo(() => [...selected], [selected]);
  const hasSel = selected.size > 0;
  const addLabel = selected.size === 1 ? name(selectedIds[0]) : `${selected.size} players`;
  function toggleSel(id: string) {
    setSelected((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  function clearSel() { setSelected(new Set()); }

  function mutate(fn: (draft: LocalTeam[]) => LocalTeam[]) {
    setTeams((prev) => fn(prev.map((t) => ({ ...t, members: [...t.members] }))));
    setBreakdowns({}); // any team edit makes a prior calculation stale
    setExpanded(new Set());
    setDirty(true);
  }
  function toggleExpand(key: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(key)) n.delete(key); else n.add(key); return n; });
  }

  function doGenerate() {
    // A/B/C/D snake draft. Order players by handicap (unknowns treated as highest),
    // then deal one tier at a time, reversing direction each tier. Every team ends
    // up with one player from each quartile, and the serpentine order keeps the
    // total strength balanced (the best A pairs with the weakest B, and so on).
    const sorted = [...participants].sort(
      (a, b) => (a.handicap_index ?? Infinity) - (b.handicap_index ?? Infinity),
    );
    const numTeams = Math.max(1, Math.ceil(sorted.length / teamSize));
    const buckets: string[][] = Array.from({ length: numTeams }, () => []);
    sorted.forEach((p, rank) => {
      const tier = Math.floor(rank / numTeams); // 0 = A (lowest hdcp), 1 = B, …
      const pos = rank % numTeams;
      const teamIdx = tier % 2 === 0 ? pos : numTeams - 1 - pos;
      buckets[teamIdx].push(p.user_id);
    });
    keySeq.current = 0;
    setTeams(buckets.map((members, i) => ({ key: nextKey(), name: "", handicap: null, tee_time: i === 0 ? startHHMM : "", members })));
    clearSel();
    setDirty(true);
  }
  function generate() {
    if (teams.some((t) => t.members.length > 0)) setConfirmGen(true);
    else doGenerate();
  }

  async function autoHandicaps() {
    if (calcBusy) return;
    setCalcBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests/${contestId}/teams/handicaps`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teams: teams.map((t) => ({ key: t.key, members: t.members })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setError(d.error || "Could not calculate handicaps"); return; }
      const handicaps: Record<string, number> = d.handicaps || {};
      // Apply directly (not via mutate, which would wipe the breakdowns we set next).
      setTeams((prev) => prev.map((t) => (handicaps[t.key] != null ? { ...t, handicap: handicaps[t.key] } : t)));
      setDirty(true);
      setBreakdowns(d.breakdowns || {});
      setCalcTeeName(d.tee_name || null);
      setMissingCount((d.missing || []).length);
    } finally {
      setCalcBusy(false);
    }
  }

  function addTeam() {
    // With players selected, create the team AND drop them in (removing them from
    // any team they were on) in one step.
    const ids = [...selected];
    mutate((d) => [
      ...d.map((t) => ({ ...t, members: t.members.filter((m) => !selected.has(m)) })),
      { key: nextKey(), name: "", handicap: null, tee_time: d.length === 0 ? startHHMM : "", members: ids },
    ]);
    clearSel();
  }
  function removeTeam(key: string) {
    mutate((d) => d.filter((t) => t.key !== key)); // members fall back to the pool
  }
  function placeSelected(teamKey: string) {
    if (selected.size === 0) return;
    const ids = selected;
    mutate((d) => d.map((t) => ({ ...t, members: t.members.filter((m) => !ids.has(m)) })).map((t) => (t.key === teamKey ? { ...t, members: [...t.members, ...ids] } : t)));
    clearSel();
  }
  function removeMember(uid: string) {
    mutate((d) => d.map((t) => ({ ...t, members: t.members.filter((m) => m !== uid) })));
    setSelected((prev) => { if (!prev.has(uid)) return prev; const n = new Set(prev); n.delete(uid); return n; });
  }
  function setHandicap(key: string, delta: number) {
    mutate((d) => d.map((t) => (t.key === key ? { ...t, handicap: Math.max(0, Math.min(54, (t.handicap ?? 0) + delta)) } : t)));
  }
  function setField(key: string, patch: Partial<LocalTeam>) {
    mutate((d) => d.map((t) => (t.key === key ? { ...t, ...patch } : t)));
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests/${contestId}/teams`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        teams: teams.map((t) => ({ name: t.name || null, team_handicap: t.handicap, tee_time: t.tee_time || null, members: t.members })),
      }),
    });
    setSaving(false);
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error || "Could not save");
      return;
    }
    const { teams: saved } = (await res.json()) as { teams: TeamData[] };
    keySeq.current = 0;
    setTeams(saved.map((t) => ({ key: nextKey(), name: t.name || "", handicap: t.team_handicap, tee_time: t.tee_time ? t.tee_time.slice(0, 5) : "", members: [...t.members] })));
    setDirty(false);
  }

  return (
    <div>
      <div className={styles.teamsControls}>
        <div className={styles.pillRow} role="group" aria-label="Team size">
          {SIZES.map((s) => (
            <button key={s} type="button" className={styles.pill} data-on={teamSize === s || undefined} onClick={() => setTeamSize(s)}>
              {s}-man
            </button>
          ))}
        </div>
        <button type="button" className={styles.genBtn} onClick={generate}>
          <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden>
            <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
          </svg>
          Generate teams
        </button>
        <button type="button" className={styles.calcBtn} onClick={autoHandicaps} disabled={calcBusy || teams.length === 0}>
          {calcBusy ? "Calculating…" : "Auto handicaps"}
        </button>
      </div>
      {missingCount > 0 && (
        <p className={styles.teamsHint}>
          {missingCount} player{missingCount === 1 ? "" : "s"} had no handicap on file (counted as 0). Adjust manually if needed.
        </p>
      )}

      {hasSel && (
        <p className={styles.teamsHint}>
          <strong>{selected.size}</strong> selected. Tap a team&apos;s <strong>+ Add</strong>, or <strong>New team</strong>.{" "}
          <button type="button" className={styles.linkAction} onClick={clearSel}>Clear</button>
        </p>
      )}

      {/* Unassigned pool */}
      <div className={styles.section}>
        <p className={styles.sectionLabel}>Unassigned ({unassigned.length})</p>
        {unassigned.length === 0 ? (
          <p className={styles.dnsHint}>Everyone&apos;s on a team.</p>
        ) : (
          <div className={styles.contestRoster}>
            {unassigned.map((p) => (
              <button
                key={p.user_id}
                type="button"
                className={styles.rosterChip}
                data-selected={selected.has(p.user_id) || undefined}
                onClick={() => toggleSel(p.user_id)}
              >
                {p.avatar_url ? <img src={p.avatar_url} alt="" className={styles.rosterChipAvatar} /> : <span className={styles.rosterChipAvatar} data-mono>{name(p.user_id).charAt(0).toUpperCase()}</span>}
                {name(p.user_id)}
                {hcpBadge(p.user_id)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Teams */}
      <div className={styles.teamList}>
        {teams.map((t, i) => (
          <div
            key={t.key}
            className={styles.teamCard}
            data-target={hasSel ? "1" : undefined}
            onClick={() => hasSel && placeSelected(t.key)}
          >
            <div className={styles.teamHead}>
              <input
                className={styles.teamNameInput}
                value={t.name}
                placeholder={`Team ${i + 1}`}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => setField(t.key, { name: e.target.value })}
                maxLength={40}
              />
              <button type="button" className={styles.teamRemove} aria-label="Remove team" onClick={(e) => { e.stopPropagation(); removeTeam(t.key); }}>
                <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {hasSel && selectedIds.some((id) => !t.members.includes(id)) && (
              <button type="button" className={styles.teamAddHere} onClick={(e) => { e.stopPropagation(); placeSelected(t.key); }}>
                + Add {addLabel}
              </button>
            )}

            {t.members.length > 0 && (
              <div className={styles.teamMembers}>
                {t.members.map((uid) => (
                  <button
                    key={uid}
                    type="button"
                    className={styles.rosterChip}
                    data-selected={selected.has(uid) || undefined}
                    onClick={(e) => { e.stopPropagation(); toggleSel(uid); }}
                  >
                    {name(uid)}
                    {hcpBadge(uid)}
                    <span
                      className={styles.chipX}
                      role="button"
                      aria-label={`Remove ${name(uid)}`}
                      onClick={(e) => { e.stopPropagation(); removeMember(uid); }}
                    >
                      <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                    </span>
                  </button>
                ))}
              </div>
            )}

            <div className={styles.teamMeta} onClick={(e) => e.stopPropagation()}>
              <div className={styles.teamStepper}>
                <span className={styles.teamMetaLabel}>Hdcp</span>
                <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => setHandicap(t.key, -1)} aria-label="Decrease handicap"><span className={styles.stepGlyph}>−</span></button>
                <span className={styles.teamStepperVal}>{t.handicap ?? "-"}</span>
                <button type="button" className={styles.stepBtn} data-kind="minor" onClick={() => setHandicap(t.key, 1)} aria-label="Increase handicap"><span className={styles.stepGlyph}>+</span></button>
              </div>
              <label className={styles.teamTee}>
                <span className={styles.teamMetaLabel}>Tee</span>
                <input type="time" value={t.tee_time} onChange={(e) => setField(t.key, { tee_time: e.target.value })} />
              </label>
            </div>

            {breakdowns[t.key] && (
              <div onClick={(e) => e.stopPropagation()}>
                <button type="button" className={styles.teamCalcToggle} onClick={() => toggleExpand(t.key)}>
                  {expanded.has(t.key) ? "Hide calculation" : "Show calculation"}
                </button>
                {expanded.has(t.key) && (
                  <div className={styles.teamCalcPanel}>
                    {calcTeeName && <p className={styles.teamCalcTee}>Course handicaps off {calcTeeName}</p>}
                    <table className={styles.teamCalcTable}>
                      <tbody>
                        <tr className={styles.teamCalcHead}>
                          <th>Player</th><th>HI</th><th>CH</th><th>Wt</th><th>=</th>
                        </tr>
                        {breakdowns[t.key].members.map((m) => (
                          <tr key={m.user_id}>
                            <td className={styles.teamCalcName}>{name(m.user_id)}</td>
                            <td>{m.handicap_index != null ? m.handicap_index.toFixed(1) : "0*"}</td>
                            <td>{m.course_handicap.toFixed(1)}</td>
                            <td>{Math.round(m.weight * 100)}%</td>
                            <td>{m.contribution.toFixed(1)}</td>
                          </tr>
                        ))}
                        <tr className={styles.teamCalcTotal}>
                          <td colSpan={4}>Team handicap</td>
                          <td>{breakdowns[t.key].team_handicap}</td>
                        </tr>
                      </tbody>
                    </table>
                    <p className={styles.teamCalcNote}>* no handicap on file, counted as 0</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        <button type="button" className={styles.addTeamBtn} onClick={addTeam}>+ New team{hasSel ? ` with ${addLabel}` : ""}</button>
      </div>

      {error && <p className={styles.formError} style={{ marginTop: 14 }}>{error}</p>}

      <div className={styles.teamsSaveBar}>
        <button type="button" className={styles.createBtn} onClick={save} disabled={saving || !dirty} style={{ opacity: saving || !dirty ? 0.6 : 1 }}>
          {saving ? "Saving…" : dirty ? "Save teams" : "Saved"}
        </button>
      </div>

      <ConfirmModal
        open={confirmGen}
        title="Generate new teams?"
        message="This shuffles everyone into fresh teams and replaces the current ones."
        confirmLabel="Generate"
        destructive
        onConfirm={() => { setConfirmGen(false); doGenerate(); }}
        onCancel={() => setConfirmGen(false)}
      />
    </div>
  );
}
