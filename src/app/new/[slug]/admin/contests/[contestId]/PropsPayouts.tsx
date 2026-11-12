"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import type { PropsPayouts } from "@/lib/v2/contests/props-server";
import { placeLabel } from "@/lib/v2/contests/payouts";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/** Admin Props payouts: the prize breakdown by leaderboard place + per-winner settlement
 *  (credit winnings to their account). Mirrors the Auction payouts panel. */
export default function PropsPayouts({ apiBase, payouts }: { apiBase: string; payouts: PropsPayouts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/props/payout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Something went wrong."); setBusy(false); return; }
      router.refresh(); setBusy(false);
    } catch { setErr("Something went wrong."); setBusy(false); }
  }

  if (payouts.totalCents === 0 && payouts.potCents === 0) return null;

  const over = payouts.totalCents > payouts.potCents && payouts.potCents > 0;
  return (
    <div style={{ marginTop: 22 }}>
      <p className={styles.sectionLabel} style={{ margin: 0 }}>Winnings</p>
      <p className={styles.roundFormHint} style={{ marginTop: 4 }}>
        Prizes {money(payouts.totalCents)} allocated{payouts.potCents > 0 ? `, ${money(payouts.potCents - payouts.totalCents)} of the ${money(payouts.potCents)} pot unallocated` : ""}.
        {over && <strong style={{ color: "var(--err, #c0392b)" }}> Prizes exceed the pot.</strong>}
      </p>
      {payouts.totalCents > 0 && !payouts.ready && <p className={styles.roundFormHint} style={{ marginTop: 2 }}>Winners finalize once every question is settled. Amounts and current leaders show below.</p>}
      {err && <p className={styles.err} style={{ margin: "6px 0 0" }}>{err}</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {payouts.prizes.map((p) => (
          <div key={p.place} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}>{p.label}</span>
            <span style={{ fontSize: "0.85rem", color: p.winnerName ? "var(--ink)" : "var(--ink-soft)" }}>{p.winnerName ?? "TBD"}</span>
            <span style={{ fontWeight: 800, color: "var(--brand)", minWidth: 60, textAlign: "right" }}>{money(p.amountCents)}</span>
          </div>
        ))}
      </div>

      {payouts.ready && payouts.winners.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--ink-soft)", margin: "0 0 6px" }}>Settle winnings</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {payouts.winners.map((w) => {
              const paid = w.paidCents >= w.wonCents;
              return (
                <div key={w.userId} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 10, background: paid ? "var(--brand-tint, #e8f2ec)" : "var(--card)" }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: "0.88rem", fontWeight: 700 }}>{w.name}</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)", display: "block" }}>{placeLabel(w.place)} place</span>
                  </span>
                  <span style={{ fontWeight: 800, color: "var(--brand)" }}>{money(w.wonCents)}</span>
                  {paid
                    ? <button type="button" className={styles.createBtnGhost} style={{ width: "auto", padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy} onClick={() => void act({ action: "unmark_paid", userId: w.userId })}>Paid ✓</button>
                    : <button type="button" className={styles.createBtn} style={{ width: "auto", padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy} onClick={() => void act({ action: "mark_paid", userId: w.userId, amountCents: w.wonCents })}>Credit account</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
