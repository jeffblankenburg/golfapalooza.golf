"use client";

import { useEffect, useState } from "react";
import styles from "@/app/new/new.module.css";

/**
 * "Who's paid their entry" — buy-in (entry) payment status for a GROUP contest.
 * The per-member obligation is DERIVED by the type-aware /payments endpoint
 * (Pick'em = flat entry; Squares = squares owned × cost); marking paid records a
 * ledger payment to the collector. Shared by both the Squares and Pick'em detail
 * pages — the only difference is the wording, passed in via props.
 */
interface Row { userId: string; name: string; owedCents: number; paidCents: number }

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function ContestEntryPaid({
  orgId,
  contestId,
  title,
  emptyText,
}: {
  orgId: string;
  contestId: string;
  title: string;      // e.g. "Who's paid for their squares" / "Who's paid their entry"
  emptyText: string;  // e.g. "No squares claimed yet." / "No one's entered yet."
}) {
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
        {title}{roster.length > 0 ? ` (${roster.length - unpaid}/${roster.length})` : ""}
      </summary>
      <div style={{ padding: "0 14px 14px" }}>
        {roster.length === 0 ? (
          <p className={styles.dnsHint} style={{ marginTop: 4 }}>{emptyText}</p>
        ) : (
          <div className={styles.memberList} style={{ marginTop: 4 }}>
            {roster.map((r) => {
              const paid = r.paidCents >= r.owedCents && r.owedCents > 0;
              const due = Math.max(0, r.owedCents - r.paidCents);
              const over = Math.max(0, r.paidCents - r.owedCents);
              // The whole story: total commitment, what's in, and what's still due.
              let meta: React.ReactNode;
              if (r.paidCents === 0) meta = <>{money(r.owedCents)} due</>;
              else if (due > 0) meta = <><strong style={{ color: "#a3341f" }}>{money(due)} still due</strong> <span style={{ color: "var(--ink-soft)" }}>({money(r.paidCents)} of {money(r.owedCents)} paid)</span></>;
              else if (over > 0) meta = <>Paid {money(r.paidCents)} <span style={{ color: "var(--ink-soft)" }}>(overpaid {money(over)})</span></>;
              else meta = <>Paid {money(r.owedCents)} in full</>;
              return (
                <div key={r.userId} className={styles.finRow}>
                  <div className={styles.finRowMain} style={{ minWidth: 0, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span className={styles.finRowName}>{r.name}</span>
                    {r.owedCents > 0 && <span className={styles.cscAllMeta}>{meta}</span>}
                  </div>
                  <button type="button" className={paid ? styles.paidToggleOn : styles.paidToggle} disabled={busy === r.userId} onClick={() => toggle(r)}>
                    {busy === r.userId ? "…" : paid ? "Paid ✓" : due > 0 && r.paidCents > 0 ? `Collect ${money(due)}` : "Mark paid"}
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
