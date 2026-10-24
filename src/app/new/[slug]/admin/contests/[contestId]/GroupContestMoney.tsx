"use client";

import { useEffect, useState } from "react";
import { computePickemPayouts, type PayoutSplit } from "@/lib/v2/contests/pickem";
import PayoutSplitsEditor, { ordinal } from "../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import styles from "@/app/new/new.module.css";

/**
 * Payout splits for a GROUP (event-less) Pick'em. The buy-in and collector live in
 * the gear quick-settings; entry-paid status is its own accordion (ContestEntryPaid)
 * and winnings are settled in the Winnings & payouts manager. Here the admin only
 * divides the pot by place. The buy-in + pot size are derived (config.entry_cents ×
 * entrants); nothing here is stored except the splits.
 */
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
  const [roster, setRoster] = useState<number>(0);
  const [entryCents, setEntryCents] = useState(initialEntryCents);

  useEffect(() => {
    (async () => {
      const r = await fetch(`${base}/payments`);
      if (r.ok) { const d = await r.json(); setRoster((d.roster || []).length); setEntryCents(d.entryCents || 0); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, contestId]);

  function saveSplits(next: PayoutSplit[]) {
    setSplits(next);
    void fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payout_splits: next }) });
  }

  const pot = entryCents * roster;
  const payouts = computePickemPayouts(pot, splits);

  return (
    <div style={{ marginTop: 20 }}>
      <div className={styles.field} style={{ marginBottom: 0 }}>
        <label className={styles.label}>Payout splits <span className={styles.optional}>(how the pot is divided by place)</span></label>
        <PayoutSplitsEditor value={splits} onSave={saveSplits} />
        {entryCents > 0 && roster > 0 && (
          <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
            Pot: {money(entryCents)} × {roster} in = <strong style={{ color: "var(--brand)" }}>{money(pot)}</strong>
          </p>
        )}
        {entryCents > 0 && payouts.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {payouts.map((p) => <span key={p.place} className={styles.roleBadge}>{ordinal(p.place)}: {money(p.amountCents)}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}
