"use client";

import { Fragment, useState } from "react";
import styles from "@/app/new/new.module.css";

export interface OrgBalanceDisplayRow {
  userId: string;
  name: string;
  owedCents: number;
  paidCents: number;
  balanceCents: number;
  lines: { label: string; amountCents: number }[];
}

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * Read-only group financial board (#237). Every member's net money across all events
 * + group contests. Tap a member to expand the owed breakdown. Payments are recorded
 * where the money lives — per event (Balances) or per contest (its collector page) —
 * so this view only nets and shows, it doesn't edit.
 */
export default function OrgBalances({ rows }: { rows: OrgBalanceDisplayRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const totals = rows.reduce(
    (a, r) => ({ owed: a.owed + r.owedCents, paid: a.paid + r.paidCents, bal: a.bal + r.balanceCents }),
    { owed: 0, paid: 0, bal: 0 },
  );

  if (rows.length === 0) {
    return <p className={styles.dnsHint} style={{ marginTop: 18 }}>No balances yet. They appear once members RSVP, pick options, or join a contest with a buy-in.</p>;
  }

  return (
    <div className={styles.balGrid} style={{ marginTop: 18 }}>
      <div className={styles.balHead}>
        <span>Member</span><span>Owed</span><span>Paid</span><span>Balance</span>
      </div>
      {rows.map((r) => {
        const isOpen = open === r.userId;
        return (
          <Fragment key={r.userId}>
            <button type="button" className={styles.balRow} onClick={() => setOpen(isOpen ? null : r.userId)}>
              <span className={styles.balName}>
                <span className={styles.balCaret} data-open={isOpen ? "1" : undefined}>›</span>
                {r.name}
              </span>
              <span className={styles.balNum}>{r.owedCents ? money(r.owedCents) : ""}</span>
              <span className={styles.balNum} data-paid="1">{r.paidCents ? money(r.paidCents) : ""}</span>
              <span className={styles.balNum} data-state={r.balanceCents > 0 ? "owes" : r.balanceCents < 0 ? "credit" : "settled"}>
                {r.balanceCents < 0 ? `(${money(-r.balanceCents)})` : money(r.balanceCents)}
              </span>
            </button>
            {isOpen && r.lines.length > 0 && (
              <div className={styles.orgBalLines}>
                {r.lines.map((l, i) => (
                  <div key={i} className={styles.orgBalLineRow}>
                    <span>{l.label}</span>
                    <span>{money(l.amountCents)}</span>
                  </div>
                ))}
              </div>
            )}
          </Fragment>
        );
      })}
      <div className={styles.balTotals}>
        <span>Totals</span>
        <span className={styles.balNum}>{money(totals.owed)}</span>
        <span className={styles.balNum} data-paid="1">{money(totals.paid)}</span>
        <span className={styles.balNum} data-state={totals.bal > 0 ? "owes" : totals.bal < 0 ? "credit" : "settled"}>
          {totals.bal < 0 ? `(${money(-totals.bal)})` : money(totals.bal)}
        </span>
      </div>
    </div>
  );
}
