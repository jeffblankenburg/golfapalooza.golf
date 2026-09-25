"use client";

import { useState } from "react";
import styles from "@/app/new/new.module.css";
/* eslint-disable @next/next/no-img-element */

interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
  search: string;
}

const pad = (n: number) => String(n).padStart(2, "0");
function toLocalInput(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Admin simulator: view the app as another member, and/or override "now". Both are
 * cookie-based dev tools gated to org admins; changes reload so the whole app picks
 * them up. A persistent banner (mounted app-wide) shows what's active + an exit.
 */
export default function SimulatorPanel({
  members,
  currentSimUserId,
  currentSimAt,
}: {
  slug: string;
  members: Member[];
  currentSimUserId: string | null;
  currentSimAt: string | null;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [at, setAt] = useState(toLocalInput(currentSimAt));

  async function simulate(userId: string) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await fetch("/api/v2/sim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      if (res.ok) window.location.href = window.location.pathname;
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  async function stopUser() {
    setBusy(true);
    try {
      await fetch("/api/v2/sim", { method: "DELETE" });
    } catch {}
    window.location.reload();
  }

  async function setTime() {
    if (busy || !at) return;
    setBusy(true);
    try {
      const iso = new Date(at).toISOString();
      const res = await fetch("/api/v2/sim/time", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ at: iso }) });
      if (res.ok) window.location.reload();
      else setBusy(false);
    } catch {
      setBusy(false);
    }
  }

  async function resetTime() {
    setBusy(true);
    try {
      await fetch("/api/v2/sim/time", { method: "DELETE" });
    } catch {}
    window.location.reload();
  }

  const query = q.trim().toLowerCase();
  const shown = query ? members.filter((m) => m.search.includes(query)) : members;
  const simName = members.find((m) => m.userId === currentSimUserId)?.name ?? null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {/* ── User simulator ── */}
      <section>
        <label className={styles.label}>View as member</label>
        <p className={styles.roundFormHint} style={{ marginTop: -2, marginBottom: 8 }}>
          See the app exactly as another member does — their rounds, notifications, visibility.
        </p>
        {currentSimUserId && (
          <div className={styles.simActiveRow}>
            <span>
              Currently viewing as <strong>{simName || "member"}</strong>
            </span>
            <button type="button" className={styles.simStopBtn} onClick={stopUser} disabled={busy}>
              Stop
            </button>
          </div>
        )}
        <input className={styles.input} placeholder="Search members…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className={styles.simList} style={{ maxHeight: 420, marginTop: 6 }}>
          {shown.map((m) => (
            <button
              key={m.userId}
              type="button"
              className={styles.simMember}
              disabled={busy}
              data-current={m.userId === currentSimUserId || undefined}
              onClick={() => simulate(m.userId)}
            >
              {m.avatarUrl ? (
                <img src={m.avatarUrl} alt="" className={styles.simMemberAvatar} />
              ) : (
                <span className={styles.simMemberAvatarFallback}>{(m.name[0] || "?").toUpperCase()}</span>
              )}
              <span className={styles.simMemberName}>{m.name}</span>
            </button>
          ))}
          {shown.length === 0 && <p className={styles.roundFormHint}>No members found.</p>}
        </div>
      </section>

      {/* ── Time simulator ── */}
      <section>
        <label className={styles.label}>Simulate time</label>
        <p className={styles.roundFormHint} style={{ marginTop: -2, marginBottom: 8 }}>
          Override &quot;now&quot; to preview time-gated features (availability windows, opens/closes). Applies to your
          browser only.
        </p>
        {currentSimAt && (
          <div className={styles.simActiveRow}>
            <span>
              Clock set to <strong>{new Date(currentSimAt).toLocaleString()}</strong>
            </span>
            <button type="button" className={styles.simStopBtn} onClick={resetTime} disabled={busy}>
              Reset
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className={styles.input} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} style={{ maxWidth: 240 }} />
          <button type="button" className={styles.createBtn} onClick={setTime} disabled={busy || !at} style={{ opacity: busy || !at ? 0.6 : 1 }}>
            Set time
          </button>
        </div>
      </section>
    </div>
  );
}
