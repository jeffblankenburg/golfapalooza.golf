"use client";

import { useEffect, useRef, useState } from "react";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface Member {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  search: string;
}

/**
 * Admin-only "view as member" picker (user simulator). Lists org members; picking
 * one enters simulation and reloads so the whole app re-renders as that member.
 * The gate is enforced server-side — this UI is just the entry point.
 */
export default function SimControl({ orgId, active }: { orgId: string; active: boolean }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const requested = useRef(false);

  useEffect(() => {
    if (!active || requested.current) return;
    requested.current = true;
    fetch(`/api/v2/chat/members?orgId=${orgId}`)
      .then((r) => (r.ok ? r.json() : { members: [] }))
      .then((d) => setMembers(d.members || []))
      .catch(() => {});
  }, [active, orgId]);

  async function simulate(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v2/sim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      if (res.ok) window.location.reload();
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  const query = q.trim().toLowerCase();
  const shown = query ? members.filter((m) => m.search.includes(query)) : members;

  return (
    <div className={styles.simControl}>
      <label className={styles.label}>
        View as member <span className={styles.optional}>(admin)</span>
      </label>
      <input className={styles.input} placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className={styles.simList}>
        {shown.map((m) => (
          <button key={m.userId} type="button" className={styles.simMember} disabled={busy} onClick={() => simulate(m.userId)}>
            {m.avatarUrl ? (
              <img src={m.avatarUrl} alt="" className={styles.simMemberAvatar} />
            ) : (
              <span className={styles.simMemberAvatarFallback}>{(m.displayName[0] || "?").toUpperCase()}</span>
            )}
            <span className={styles.simMemberName}>{m.displayName}</span>
          </button>
        ))}
        {shown.length === 0 && <p className={styles.roundFormHint}>No members found.</p>}
      </div>
    </div>
  );
}
