"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * "Who's paid for their squares" — entry (buy-in) payment status for a Squares pool.
 * Each owner owes (squares owned × cost); mark paid records a ledger payment to the
 * collector. The squares-aware /payments endpoint supplies per-member owed amounts.
 */
interface Row { userId: string; name: string; owedCents: number; paidCents: number }

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function SquaresEntryPaid({ orgId, contestId }: { orgId: string; contestId: string }) {
  const base = `/api/v2/orgs/${orgId}/contests/${contestId}`;
  const [roster, setRoster] = useState<Row[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await fetch(`${base}/payments`);
    if (r.ok) setRoster(((await r.json()).roster || []) as Row[]);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, contestId]);

  async function toggle(row: Row) {
    if (busy) return;
    setBusy(row.userId);
    try {
      const paid = row.paidCents >= row.owedCents && row.owedCents > 0;
      if (paid) await fetch(`${base}/payments?userId=${row.userId}`, { method: "DELETE" });
      else await fetch(`${base}/payments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: row.userId }) });
      await load();
    } finally { setBusy(null); }
  }

  const unpaid = roster.filter((r) => r.owedCents > 0 && r.paidCents < r.owedCents).length;
  return (
    <details style={{ marginTop: 20, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }}>
      <summary style={{ padding: "12px 14px", cursor: "pointer", fontWeight: 700 }}>
        Who&apos;s paid for their squares{roster.length > 0 ? ` (${roster.length - unpaid}/${roster.length})` : ""}
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        {roster.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 4 }}>No squares claimed yet.</p>
        ) : (
          <div className={styles.memberList} style={{ marginTop: 4 }}>
            {roster.map((r) => {
              const paid = r.paidCents >= r.owedCents && r.owedCents > 0;
              return (
                <div key={r.userId} className={styles.finRow}>
                  <div className={styles.finRowMain} style={{ minWidth: 0 }}>
                    <span className={styles.finRowName}>{r.name}</span>
                    {r.owedCents > 0 && <span className={styles.cscAllMeta}>{money(r.owedCents)}</span>}
                  </div>
                  <button type="button" className={paid ? styles.paidToggleOn : styles.paidToggle} disabled={busy === r.userId} onClick={() => toggle(r)}>
                    {busy === r.userId ? "…" : paid ? "Paid ✓" : "Mark paid"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}
