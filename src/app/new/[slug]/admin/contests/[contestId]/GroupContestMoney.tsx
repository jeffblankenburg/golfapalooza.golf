"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * Money for a GROUP (event-less) contest — the buy-in + who collects it + a
 * mark-paid roster. The buy-in is DERIVED (config.entry_cents) so it flows into
 * members' "My Money" attributed to the collector; only payments are stored. The
 * collector must have a Venmo handle so members can settle up.
 */
interface MemberOpt { user_id: string; name: string; venmo: string | null }
interface RosterRow { userId: string; name: string; paidCents: number }

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function GroupContestMoney({
  orgId,
  contestId,
  currentUserId,
  initialEntryCents,
  initialCollectedBy,
}: {
  orgId: string;
  contestId: string;
  currentUserId: string;
  initialEntryCents: number;
  initialCollectedBy: string | null;
}) {
  const base = `/api/v2/orgs/${orgId}/contests/${contestId}`;
  const [fee, setFee] = useState(initialEntryCents ? String(initialEntryCents / 100) : "");
  // Default the collector to whoever's setting it up (the active admin) rather than
  // an abstract "creator" choice — they can reassign it.
  const [collectedBy, setCollectedBy] = useState(initialCollectedBy || currentUserId);
  const [members, setMembers] = useState<MemberOpt[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [entryCents, setEntryCents] = useState(initialEntryCents);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadRoster() {
    const r = await fetch(`${base}/payments`);
    if (r.ok) { const d = await r.json(); setRoster(d.roster || []); setEntryCents(d.entryCents || 0); }
  }

  useEffect(() => {
    (async () => {
      const mr = await fetch(`/api/v2/orgs/${orgId}/members`);
      if (mr.ok) {
        const list = ((await mr.json()).members || []) as { user_id: string; display_name: string; venmo_username: string | null; archived?: boolean }[];
        setMembers(list.filter((m) => !m.archived).map((m) => ({ user_id: m.user_id, name: m.display_name, venmo: m.venmo_username })).sort((a, b) => a.name.localeCompare(b.name)));
      }
      await loadRoster();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, contestId]);

  async function patch(body: Record<string, unknown>) {
    await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  }

  async function saveFee() {
    const cents = Math.round((Number(fee) || 0) * 100);
    // Persist the collector alongside the fee so the implicit default (active user)
    // becomes explicit the moment a fee is set.
    await patch({ entry_cents: cents, collected_by: collectedBy || null });
    await loadRoster();
  }

  async function togglePaid(row: RosterRow) {
    if (busy) return;
    setBusy(row.userId);
    try {
      const paid = row.paidCents >= entryCents && entryCents > 0;
      if (paid) await fetch(`${base}/payments?userId=${row.userId}`, { method: "DELETE" });
      else await fetch(`${base}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: row.userId }) });
      await loadRoster();
    } finally { setBusy(null); }
  }

  const pot = entryCents * roster.length;
  const collectorVenmo = members.find((m) => m.user_id === collectedBy)?.venmo;

  return (
    <div style={{ marginTop: 20 }}>
      <p className={styles.sectionLabel}>Buy-in &amp; collection</p>

      <div className={styles.field}>
        <label className={styles.label}>Entry fee <span className={styles.optional}>(per member)</span></label>
        <input className={styles.input} inputMode="decimal" value={fee} placeholder="0"
          onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} onBlur={saveFee} />
        {entryCents > 0 && roster.length > 0 && (
          <p className={styles.roundFormHint} style={{ marginTop: 4 }}>Pot: {money(entryCents)} × {roster.length} in = <strong style={{ color: "var(--brand)" }}>{money(pot)}</strong></p>
        )}
      </div>

      <div className={styles.field}>
        <label className={styles.label}>Who&apos;s collecting? <span className={styles.optional}>(needs Venmo)</span></label>
        <select className={styles.roleSelect} value={collectedBy}
          onChange={(e) => { setCollectedBy(e.target.value); patch({ collected_by: e.target.value || null }).then(loadRoster); }}>
          {members.map((m) => <option key={m.user_id} value={m.user_id} disabled={!m.venmo && m.user_id !== collectedBy}>{m.name}{m.venmo ? "" : " (needs Venmo)"}</option>)}
        </select>
        {entryCents > 0 && collectedBy && !collectorVenmo && (
          <p className={styles.formError} style={{ marginTop: 4 }}>This collector has no Venmo on file — members won&apos;t get a pay button.</p>
        )}
      </div>

      {entryCents > 0 && (
        <div style={{ marginTop: 8 }}>
          <p className={styles.sectionLabel}>Who&apos;s paid</p>
          {roster.length === 0 ? (
            <p className={styles.dnsHint} style={{ marginTop: 4 }}>No one&apos;s entered yet.</p>
          ) : (
            <div className={styles.memberList} style={{ marginTop: 4 }}>
              {roster.map((r) => {
                const paid = r.paidCents >= entryCents;
                return (
                  <div key={r.userId} className={styles.finRow}>
                    <div className={styles.finRowMain}><span className={styles.finRowName}>{r.name}</span></div>
                    <button type="button" className={paid ? styles.paidToggleOn : styles.paidToggle} disabled={busy === r.userId} onClick={() => togglePaid(r)}>
                      {busy === r.userId ? "…" : paid ? "Paid ✓" : "Mark paid"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
