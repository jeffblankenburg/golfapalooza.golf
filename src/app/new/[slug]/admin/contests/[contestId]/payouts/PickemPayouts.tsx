"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./MasterPayouts.module.css";
import { venmoLink, paypalLink } from "@/lib/v2/payments";
import { ordinal } from "../../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import type { PickemPayoutPerson } from "./loadPickemPayouts";

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

/**
 * Pick'em winnings manager (issue #5b) — mirror of the Squares MasterPayouts, but
 * place-based: who finished where, what they won, and how they were paid. Three
 * settle methods: Venmo / PayPal (external cash-out) or Apply to account (a ledger
 * credit that offsets what they owe). Winners show only once the slate is final.
 */
export default function PickemPayouts({
  orgId,
  contestId,
  name,
  ready,
  people,
}: {
  orgId: string;
  contestId: string;
  name: string;
  ready: boolean;
  people: PickemPayoutPerson[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const openRow = (p: PickemPayoutPerson) => {
    if (open === p.userId) { setOpen(null); return; }
    setOpen(p.userId);
    setNoteDraft(p.note ?? "");
  };

  const totalWon = people.reduce((t, p) => t + p.wonCents, 0);
  const totalOwed = people.reduce((t, p) => t + Math.max(0, p.wonCents - p.paidCents), 0);

  async function act(action: string, person: PickemPayoutPerson, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(person.userId);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${contestId}/pickem/payout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, userId: person.userId, ...extra }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) setErr(d.error || "Couldn't update.");
      else router.refresh();
    } catch {
      setErr("Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  if (!ready) {
    return <p className={styles.empty}>Winners show once every game is scored.</p>;
  }

  return (
    <div>
      <div className={styles.summary}>
        <span>Total won <b>{money(totalWon)}</b></span>
        <span>Still owed <b data-owed={totalOwed > 0 || undefined}>{money(totalOwed)}</b></span>
      </div>

      {people.length === 0 ? (
        <p className={styles.empty}>No winnings to pay out for this slate.</p>
      ) : (
        people.map((p) => {
          const owed = Math.max(0, p.wonCents - p.paidCents);
          const paid = p.paidCents >= p.wonCents && p.wonCents > 0;
          const note = `${name} payout`;
          const venmo = owed > 0 ? venmoLink(p.venmo, owed, note) : null;
          const paypal = owed > 0 ? paypalLink(p.paypal, owed) : null;
          const isOpen = open === p.userId;
          const settle = (method: string) => act("mark_paid", p, { amountCents: owed, method, note: noteDraft });
          return (
            <div key={p.userId} className={styles.row} data-paid={paid || undefined}>
              <button type="button" className={styles.head} onClick={() => openRow(p)}>
                <span className={styles.name}>
                  {p.place > 0 && <span style={{ color: "var(--ink-soft)", fontWeight: 700, marginRight: 6 }}>{ordinal(p.place)}</span>}
                  {p.name}
                  {!p.entryPaid && <span style={{ marginLeft: 6, fontSize: "0.68rem", fontWeight: 700, color: "var(--warn, #c2410c)" }}>entry unpaid</span>}
                  {paid && p.method && <span className={styles.headNote}>{p.method}</span>}
                </span>
                <span>
                  {paid ? (
                    <span className={styles.paidTag}>Paid ✓</span>
                  ) : p.paidCents > 0 ? (
                    <span className={styles.owedTag}>owes {money(owed)}</span>
                  ) : (
                    <span className={styles.wonTag}>{money(p.wonCents)}</span>
                  )}
                </span>
              </button>

              {isOpen && (
                <div className={styles.body}>
                  <div className={styles.breakdown}>
                    <span>{p.correct} correct</span>
                    <span>Won {money(p.wonCents)}</span>
                    {p.paidCents > 0 && <span>Paid {money(p.paidCents)}{p.appliedToAccount ? " (account)" : ""}</span>}
                    {owed > 0 && <span className={styles.owedLine}>Owes {money(owed)}</span>}
                  </div>

                  {owed > 0 && (
                    <>
                      <div className={styles.payLinks}>
                        {venmo && <a className={styles.venmo} href={venmo} target="_blank" rel="noreferrer">Pay {money(owed)} on Venmo</a>}
                        {paypal && <a className={styles.paypal} href={paypal} target="_blank" rel="noreferrer">PayPal</a>}
                        {!p.venmo && !p.paypal && (
                          p.address ? <span className={styles.address}>Mail to: {p.address}</span> : <span className={styles.noPay}>No payment info on file</span>
                        )}
                      </div>

                      <label className={styles.noteField}>
                        <span className={styles.noteLabel}>Note (how they were paid)</span>
                        <input
                          className={styles.noteInput}
                          value={noteDraft}
                          onChange={(e) => setNoteDraft(e.target.value)}
                          placeholder="e.g. Venmo, cash, mailed check"
                          maxLength={200}
                        />
                      </label>

                      <div className={styles.actions} style={{ flexWrap: "wrap" }}>
                        <button type="button" className={styles.markPaid} disabled={busy === p.userId} onClick={() => settle("Venmo")}>Mark paid (Venmo)</button>
                        <button type="button" className={styles.markPaid} disabled={busy === p.userId} onClick={() => settle("PayPal")}>PayPal</button>
                        <button type="button" className={styles.markPaid} disabled={busy === p.userId} onClick={() => settle("account")}>Apply to account</button>
                      </div>
                    </>
                  )}

                  {paid && (
                    <div className={styles.actions}>
                      <button type="button" className={styles.unmark} disabled={busy === p.userId} onClick={() => act("unmark_paid", p)}>Mark unpaid</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })
      )}
      {err && <p className={styles.err}>{err}</p>}
    </div>
  );
}
