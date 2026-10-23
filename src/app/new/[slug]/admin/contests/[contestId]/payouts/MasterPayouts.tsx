"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./MasterPayouts.module.css";
import { venmoLink, paypalLink } from "@/lib/v2/payments";

export interface PayoutPerson {
  userId: string;
  name: string;
  wonCents: number;
  paidCents: number;
  note: string | null;
  venmo: string | null;
  paypal: string | null;
  address: string | null;
  lines: { label: string; amountCents: number }[];
  games: { gameId: string; wonCents: number }[];
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

export default function MasterPayouts({
  orgId,
  slug,
  contestId,
  name,
  people,
}: {
  orgId: string;
  slug: string;
  contestId: string;
  name: string;
  people: PayoutPerson[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState("");

  const openRow = (p: PayoutPerson) => {
    if (open === p.userId) { setOpen(null); return; }
    setOpen(p.userId);
    setNoteDraft(p.note ?? "");
  };

  const totalWon = people.reduce((t, p) => t + p.wonCents, 0);
  const totalOwed = people.reduce((t, p) => t + Math.max(0, p.wonCents - p.paidCents), 0);

  async function act(action: string, person: PayoutPerson, extra?: Record<string, unknown>) {
    if (busy) return;
    setBusy(person.userId);
    setErr(null);
    try {
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${contestId}/squares/action`, {
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

  return (
    <div className={styles.page}>
      <div className={styles.topRow}>
        <Link href={`/new/${slug}/admin/contests/${contestId}`} className={styles.back}>← {name}</Link>
      </div>
      <h1 className={styles.title}>Master payouts</h1>
      <div className={styles.summary}>
        <span>Total won <b>{money(totalWon)}</b></span>
        <span>Still owed <b data-owed={totalOwed > 0 || undefined}>{money(totalOwed)}</b></span>
      </div>

      {people.length === 0 ? (
        <p className={styles.empty}>No winnings yet. Once games are scored, who to pay shows up here.</p>
      ) : (
        people.map((p) => {
          const owed = Math.max(0, p.wonCents - p.paidCents);
          const paid = p.paidCents >= p.wonCents && p.wonCents > 0;
          const note = `${name} payout`;
          const venmo = owed > 0 ? venmoLink(p.venmo, owed, note) : null;
          const paypal = owed > 0 ? paypalLink(p.paypal, owed) : null;
          const isOpen = open === p.userId;
          return (
            <div key={p.userId} className={styles.row} data-paid={paid || undefined}>
              <button type="button" className={styles.head} onClick={() => openRow(p)}>
                <span className={styles.name}>
                  {p.name}
                  {paid && p.note && <span className={styles.headNote}>{p.note}</span>}
                </span>
                <span className={styles.amounts}>
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
                  {p.lines.length > 0 && (
                    <div className={styles.lines}>
                      {p.lines.map((l, i) => (
                        <span key={i} className={styles.line}>{l.label} <b>{money(l.amountCents)}</b></span>
                      ))}
                    </div>
                  )}
                  <div className={styles.breakdown}>
                    <span>Won {money(p.wonCents)}</span>
                    {p.paidCents > 0 && <span>Paid {money(p.paidCents)}</span>}
                    {owed > 0 && <span className={styles.owedLine}>Owes {money(owed)}</span>}
                  </div>

                  {owed > 0 && (
                    <div className={styles.payLinks}>
                      {venmo && <a className={styles.venmo} href={venmo} target="_blank" rel="noreferrer" onClick={() => setNoteDraft("Paid via Venmo")}>Pay {money(owed)} on Venmo</a>}
                      {paypal && <a className={styles.paypal} href={paypal} target="_blank" rel="noreferrer" onClick={() => setNoteDraft("Paid via PayPal")}>PayPal</a>}
                      {!p.venmo && !p.paypal && (
                        p.address ? <span className={styles.address}>Mail to: {p.address}</span> : <span className={styles.noPay}>No payment info on file</span>
                      )}
                    </div>
                  )}

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

                  <div className={styles.actions}>
                    {paid ? (
                      <button type="button" className={styles.unmark} disabled={busy === p.userId} onClick={() => act("unmark_paid", p)}>Mark unpaid</button>
                    ) : (
                      <button type="button" className={styles.markPaid} disabled={busy === p.userId} onClick={() => act("mark_paid", p, { items: p.games.map((g) => ({ gameId: g.gameId, paidCents: g.wonCents })), note: noteDraft })}>Mark {money(owed)} paid</button>
                    )}
                    {paid && <button type="button" className={styles.unmark} disabled={busy === p.userId} onClick={() => act("mark_paid", p, { items: p.games.map((g) => ({ gameId: g.gameId, paidCents: g.wonCents })), note: noteDraft })}>Update note</button>}
                  </div>
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
