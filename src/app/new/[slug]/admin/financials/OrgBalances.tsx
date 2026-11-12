"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";

export interface OrgBalanceDisplayLine {
  label: string;
  amountCents: number;
  eventId?: string;          // event money → deep-link to that event's Balances page
  contestId?: string;        // group contest → inline mark-paid
  contestPaidCents?: number; // group contest → recorded so far
}
export interface OrgBalanceDisplayRow {
  userId: string;
  name: string;
  owedCents: number;
  paidCents: number;
  balanceCents: number;
  lines: OrgBalanceDisplayLine[];
}

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/**
 * Group financial board (#237). Every member's net money across all events + group
 * contests. Tap a member to expand the owed breakdown. Each GROUP-CONTEST line has an
 * inline mark-paid toggle (records an event-less, payee-attributed deposit via the
 * contest's own /payments endpoint — the same write the collector page uses, so there's
 * one source of truth and no double-count). EVENT money keeps its single recorder: those
 * lines deep-link to that event's Balances page.
 */
export default function OrgBalances({ rows, orgId, slug }: { rows: OrgBalanceDisplayRow[]; orgId: string; slug: string }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const totals = rows.reduce(
    (a, r) => ({ owed: a.owed + r.owedCents, paid: a.paid + r.paidCents, bal: a.bal + r.balanceCents }),
    { owed: 0, paid: 0, bal: 0 },
  );

  async function toggleContestPaid(userId: string, line: OrgBalanceDisplayLine) {
    if (!line.contestId || busy) return;
    const key = `${userId}|${line.contestId}`;
    const paid = (line.contestPaidCents ?? 0) >= line.amountCents;
    setBusy(key);
    try {
      const base = `/api/v2/orgs/${orgId}/contests/${line.contestId}/payments`;
      const res = paid
        ? await fetch(`${base}?userId=${userId}`, { method: "DELETE" })
        : await fetch(base, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId }) });
      if (res.ok) router.refresh();
    } finally {
      setBusy(null);
    }
  }

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
                {r.lines.map((l, i) => {
                  const paid = (l.contestPaidCents ?? 0) >= l.amountCents;
                  const key = `${r.userId}|${l.contestId}`;
                  return (
                    <div key={i} className={styles.orgBalLineRow}>
                      <span>{l.label}</span>
                      <span style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "flex-end" }}>
                        {money(l.amountCents)}
                        {l.contestId && (
                          <button
                            type="button"
                            className={paid ? styles.unmark : styles.markPaid}
                            disabled={busy === key}
                            onClick={() => toggleContestPaid(r.userId, l)}
                          >
                            {busy === key ? "…" : paid ? "Paid ✓" : "Mark paid"}
                          </button>
                        )}
                        {l.eventId && !l.contestId && (
                          <Link href={`/new/${slug}/admin/events/${l.eventId}/financials/balances`} className={styles.orgBalLink}>
                            Record ›
                          </Link>
                        )}
                      </span>
                    </div>
                  );
                })}
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
