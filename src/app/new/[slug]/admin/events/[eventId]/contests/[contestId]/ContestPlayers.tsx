"use client";

import { useMemo, useState } from "react";
import styles from "@/app/new/new.module.css";

export interface ContestCandidate {
  user_id: string;
  name: string;
  attending: boolean;
}

function Check({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      style={{
        width: 20,
        height: 20,
        flex: "none",
        borderRadius: 6,
        display: "grid",
        placeItems: "center",
        border: `1.5px solid ${on ? "var(--brand)" : "var(--line-strong)"}`,
        background: on ? "var(--brand)" : "transparent",
      }}
    >
      {on && (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      )}
    </span>
  );
}

/**
 * Contest players (#215) — a direct multi-select of the membership. Checked = in the
 * contest. Preset buttons fill the selection (everyone attending / everyone / none);
 * Save persists the diff (adds + removes, the latter tombstoned so attendance-sync
 * won't re-add). Participation is independent of attendance — any member is selectable,
 * attending or not.
 */
export default function ContestPlayers({
  orgId,
  eventId,
  contestId,
  members,
  initialPlayerIds,
}: {
  orgId: string;
  eventId: string;
  contestId: string;
  members: ContestCandidate[];
  initialPlayerIds: string[];
}) {
  const base = `/api/v2/orgs/${orgId}/events/${eventId}/contests/${contestId}/participants`;
  const [saved, setSaved] = useState<Set<string>>(() => new Set(initialPlayerIds));
  const [selected, setSelected] = useState<Set<string>>(() => new Set(initialPlayerIds));
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");

  const attendingIds = useMemo(() => members.filter((m) => m.attending).map((m) => m.user_id), [members]);

  const query = q.trim().toLowerCase();
  const shown = query ? members.filter((m) => m.name.toLowerCase().includes(query)) : members;
  const inMembers = shown.filter((m) => selected.has(m.user_id));
  const outMembers = shown.filter((m) => !selected.has(m.user_id));

  const toAdd = useMemo(() => [...selected].filter((id) => !saved.has(id)), [selected, saved]);
  const toRemove = useMemo(() => [...saved].filter((id) => !selected.has(id)), [selected, saved]);
  const dirty = toAdd.length > 0 || toRemove.length > 0;

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const selectAttending = () => setSelected((prev) => new Set([...prev, ...attendingIds]));
  const selectAll = () => setSelected(new Set(members.map((m) => m.user_id)));
  const selectNone = () => setSelected(new Set());
  const discard = () => setSelected(new Set(saved));

  const row = (m: ContestCandidate) => {
    const on = selected.has(m.user_id);
    return (
      <div key={m.user_id} className={styles.memberRow} style={{ padding: 0, border: "none" }}>
        <button type="button" className={styles.memberRowBtn} onClick={() => toggle(m.user_id)} aria-pressed={on} disabled={busy}>
          <Check on={on} />
          <span className={styles.memberAvatar} aria-hidden>{(m.name[0] || "?").toUpperCase()}</span>
          <div className={styles.memberMeta} style={{ minWidth: 0 }}>
            <div className={styles.memberName}>{m.name}</div>
          </div>
          {m.attending && <span className={styles.roleBadge}>attending</span>}
        </button>
      </div>
    );
  };

  async function save() {
    if (!dirty || busy) return;
    setBusy(true);
    try {
      if (toAdd.length) {
        const r = await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: toAdd }) });
        if (!r.ok) throw new Error();
      }
      if (toRemove.length) {
        const r = await fetch(base, { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userIds: toRemove }) });
        if (!r.ok) throw new Error();
      }
      setSaved(new Set(selected));
    } catch {
      /* leave the selection intact so the user can retry */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className={styles.pillRow}>
        <button type="button" className={styles.pill} onClick={selectAttending} disabled={busy}>
          All attending ({attendingIds.length})
        </button>
        <button type="button" className={styles.pill} onClick={selectAll} disabled={busy}>
          All
        </button>
        <button type="button" className={styles.pill} onClick={selectNone} disabled={busy}>
          None
        </button>
      </div>

      <input className={styles.input} placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} />

      <section>
        <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>In ({selected.size})</p>
        <div className={styles.memberList}>
          {inMembers.map(row)}
          {inMembers.length === 0 && (
            <p className={styles.roundFormHint}>{query ? "No matches." : "No one in yet — use the buttons above."}</p>
          )}
        </div>
      </section>

      <section>
        <p className={styles.sectionLabel} style={{ marginBottom: 8 }}>Not in ({members.length - selected.size})</p>
        <div className={styles.memberList}>
          {outMembers.map(row)}
          {outMembers.length === 0 && (
            <p className={styles.roundFormHint}>{query ? "No matches." : "Everyone's in."}</p>
          )}
        </div>
      </section>

      {dirty && (
        <div className={styles.teamsSaveBar}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.createBtn} onClick={save} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
              Save{toAdd.length ? ` +${toAdd.length}` : ""}{toRemove.length ? ` −${toRemove.length}` : ""}
            </button>
            <button type="button" className={styles.linkAction} onClick={discard} disabled={busy}>
              Discard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
