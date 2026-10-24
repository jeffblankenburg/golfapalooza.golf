"use client";

import { useEffect, useState } from "react";
import { computePickemPayouts, type PayoutSplit } from "@/lib/v2/contests/pickem";
import PayoutSplitsEditor, { ordinal } from "../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import styles from "@/app/new/new.module.css";

/**
 * Payouts + who's paid for a GROUP (event-less) contest. The buy-in and collector
 * live in the gear quick-settings; here the admin divides the pot by place and marks
 * members paid. The buy-in is derived (config.entry_cents); only payments are stored.
 */
interface RosterRow { userId: string; name: string; paidCents: number }

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function GroupContestMoney({
  orgId,
  contestId,
  initialEntryCents,
  initialSplits,
}: {
  orgId: string;
  contestId: string;
  initialEntryCents: number;
  initialSplits: PayoutSplit[];
}) {
  const base = `/api/v2/orgs/${orgId}/contests/${contestId}`;
  const [splits, setSplits] = useState<PayoutSplit[]>(initialSplits || []);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  const [entryCents, setEntryCents] = useState(initialEntryCents);
  const [busy, setBusy] = useState<string | null>(null);

  async function loadRoster() {
    const r = await fetch(`${base}/payments`);
    if (r.ok) { const d = await r.json(); setRoster(d.roster || []); setEntryCents(d.entryCents || 0); }
  }

  useEffect(() => {
    loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, contestId]);

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

  function saveSplits(next: PayoutSplit[]) {
    setSplits(next);
    void fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payout_splits: next }) });
  }

  const pot = entryCents * roster.length;
  const payouts = computePickemPayouts(pot, splits);

  return (
    <div style={{ marginTop: 20 }}>
      <p className={styles.sectionLabel}>Payouts &amp; who&apos;s paid</p>

      <div className={styles.field}>
        <label className={styles.label}>Payout splits <span className={styles.optional}>(how the pot is divided by place)</span></label>
        <PayoutSplitsEditor value={splits} onSave={saveSplits} />
        {entryCents > 0 && roster.length > 0 && (
          <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
            Pot: {money(entryCents)} × {roster.length} in = <strong style={{ color: "var(--brand)" }}>{money(pot)}</strong>
          </p>
        )}
        {entryCents > 0 && payouts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {payouts.map((p) => <span key={p.place} className={styles.roleBadge}>{ordinal(p.place)}: {money(p.amountCents)}</span>)}
          </div>
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
