"use client";

import { useEffect, useState } from "react";
import styles from "./ContestParticipants.module.css";

interface Entry {
  userId: string;
  name: string;
  avatarUrl: string | null;
  participating: boolean;
}

/**
 * Per-contest participant picker. Scope-agnostic: it reads a LIVE list (the event
 * roster for event contests, the group membership for group contests) from
 * `${apiBase}/participants` and toggles each member in/out of THIS contest. It
 * never holds a snapshot — reopening reflects the current roster. `apiBase` is the
 * contest's API root, e.g. /api/v2/orgs/{org}/contests/{contest}.
 */
export default function ContestParticipants({ apiBase, memberNoun = "member" }: { apiBase: string; memberNoun?: string }) {
  const [members, setMembers] = useState<Entry[] | null>(null);
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<Set<string>>(new Set());

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/participants`);
        const d = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(d.error || "Could not load");
        if (alive) setMembers(d.members || []);
      } catch (e) {
        if (alive) setErr(e instanceof Error ? e.message : "Could not load");
      }
    })();
    return () => { alive = false; };
  }, [apiBase]);

  async function toggle(entry: Entry) {
    const next = !entry.participating;
    setMembers((m) => m?.map((x) => (x.userId === entry.userId ? { ...x, participating: next } : x)) ?? m);
    setPending((p) => new Set(p).add(entry.userId));
    try {
      const res = await fetch(`${apiBase}/participants`, {
        method: next ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [entry.userId] }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMembers((m) => m?.map((x) => (x.userId === entry.userId ? { ...x, participating: !next } : x)) ?? m);
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(entry.userId); return n; });
    }
  }

  async function bulk(target: boolean) {
    if (!members) return;
    const ids = members.filter((m) => m.participating !== target).map((m) => m.userId);
    if (!ids.length) return;
    const prev = members;
    setMembers((m) => m?.map((x) => ({ ...x, participating: target })) ?? m);
    try {
      const res = await fetch(`${apiBase}/participants`, {
        method: target ? "POST" : "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: ids }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setMembers(prev);
    }
  }

  const inCount = members?.filter((m) => m.participating).length ?? 0;
  const total = members?.length ?? 0;

  return (
    <div className={styles.wrap}>
      <button type="button" className={styles.head} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={styles.title}>Participants</span>
        <span className={styles.count}>{total ? `${inCount} of ${total} in` : members ? "none yet" : "…"}</span>
        <svg className={styles.chev} data-open={open || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && (
        <div className={styles.body}>
          {err && <p className={styles.err}>{err}</p>}
          {!members ? (
            <p className={styles.muted}>Loading…</p>
          ) : members.length === 0 ? (
            <p className={styles.muted}>No {memberNoun}s yet.</p>
          ) : (
            <>
              <div className={styles.bulk}>
                <button type="button" onClick={() => void bulk(true)}>All in</button>
                <button type="button" onClick={() => void bulk(false)}>All out</button>
              </div>
              <div className={styles.list}>
                {members.map((m) => (
                  <label key={m.userId} className={styles.row} data-off={!m.participating || undefined}>
                    <span className={styles.who}>
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img className={styles.avatar} src={m.avatarUrl} alt="" />
                      ) : (
                        <span className={styles.avatarFallback}>{(m.name[0] || "?").toUpperCase()}</span>
                      )}
                      <span className={styles.name}>{m.name}</span>
                    </span>
                    <input
                      type="checkbox"
                      className={styles.toggle}
                      checked={m.participating}
                      disabled={pending.has(m.userId)}
                      onChange={() => void toggle(m)}
                    />
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
