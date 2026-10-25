"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import type { AuctionPayouts } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;

/** Admin auction payouts: the prize breakdown (who won what) + per-winner settlement
 *  (credit winnings to their account). Mirrors the Pick'em payouts panel. */
export default function AuctionPayouts({ apiBase, payouts }: { apiBase: string; payouts: AuctionPayouts }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function act(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/auction/payout`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Something went wrong."); setBusy(false); return; }
      router.refresh(); setBusy(false);
    } catch { setErr("Something went wrong."); setBusy(false); }
  }

  if (payouts.totalCents === 0) return null; // no prizes configured

  return (
    <div style={{ marginTop: 18 }}>
      <p className={styles.sectionLabel} style={{ margin: 0 }}>Payouts ({money(payouts.totalCents)} total)</p>
      {!payouts.ready && <p className={styles.roundFormHint} style={{ marginTop: 4 }}>Winners finalize once the champion is decided. Amounts and current leaders show below.</p>}
      {err && <p className={styles.err} style={{ margin: "6px 0 0" }}>{err}</p>}

      {/* Prize breakdown */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
        {payouts.prizes.map((p) => (
          <div key={p.key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
            <span style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}>{p.label}</span>
            <span style={{ fontSize: "0.85rem", color: p.winnerName ? "var(--ink)" : "var(--ink-soft)" }}>{p.winnerName ?? "TBD"}</span>
            <span style={{ fontWeight: 800, color: "var(--brand)", minWidth: 60, textAlign: "right" }}>{money(p.amountCents)}</span>
          </div>
        ))}
      </div>

      {/* Per-winner settlement */}
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
                    <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)", display: "block" }}>{w.prizeLabels.join(", ")}</span>
                  </span>
                  <span style={{ fontWeight: 800, color: "var(--brand)" }}>{money(w.wonCents)}</span>
                  {paid
                    ? <button type="button" className={styles.createBtnGhost} style={{ padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy} onClick={() => void act({ action: "unmark_paid", userId: w.userId })}>Paid ✓</button>
                    : <button type="button" className={styles.create} style={{ padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy} onClick={() => void act({ action: "mark_paid", userId: w.userId, amountCents: w.wonCents })}>Credit account</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
