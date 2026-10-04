"use client";

import { useState } from "react";
import Modal from "@/app/new/_components/Modal";
import SaveStatus from "@/app/new/_components/SaveStatus";
import { useAutoSave } from "@/app/new/_components/useAutoSave";
import styles from "@/app/new/new.module.css";
import PayoutSplitsEditor, { ordinal } from "./PayoutSplitsEditor";
import { computePlacePayouts, isTeamContest, splitAmongMembers, type PayoutSplit } from "@/lib/v2/contests/payouts";
import type { ContestType } from "@/lib/v2/contests";

const money = (c: number) => `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: c % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

/**
 * Shared "Payouts" card for any contest (#209). Set %-of-pot splits per place; pot =
 * buy-in × participants. Division is type-aware: individual contests pay one winner per
 * place; team contests split each place evenly among the winning team's members.
 */
export default function ContestPayouts({ base, contestType, initialSplits, feeCents, participantCount, teamSize }: {
  base: string;
  contestType: ContestType;
  initialSplits: PayoutSplit[];
  feeCents: number;
  participantCount: number;
  teamSize: number | null;
}) {
  const [open, setOpen] = useState(false);
  const [splits, setSplits] = useState<PayoutSplit[]>(initialSplits);
  const potCents = feeCents * participantCount;
  const payouts = computePlacePayouts(potCents, splits);
  const team = isTeamContest(contestType);

  const { state: saveState, error: saveError, retry, flush } = useAutoSave(splits, async (next) => {
    const res = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payout_splits: next }) });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Could not save");
  });

  return (
    <>
      <button type="button" className={styles.cscAcc} onClick={() => setOpen(true)} style={{ display: "block", width: "100%", textAlign: "left", cursor: "pointer" }}>
        <span className={styles.cscAccHead} style={{ pointerEvents: "none" }}>
          <span className={styles.cscAllMain}>
            <span className={styles.cscAllName}>Payouts</span>
            <span className={styles.cscAllPlayers}>{potCents > 0 ? `Pot ${money(potCents)}` : "% of pot per place"}</span>
          </span>
          <svg className={styles.cscAccChevron} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
        </span>
      </button>

      <Modal open={open} title="Payouts" onClose={() => { flush(); setOpen(false); }} footer={<SaveStatus state={saveState} error={saveError} onRetry={retry} variant="modal" />}>
        <label className={styles.label}>Payout splits (% of pot)</label>
        <PayoutSplitsEditor value={splits} onSave={setSplits} />
        {potCents > 0 ? (
          <div style={{ marginTop: 14, borderTop: "1px solid var(--line)", paddingTop: 12 }}>
            <p className={styles.roundFormHint} style={{ marginTop: 0, marginBottom: 8 }}>
              Pot: buy-in × {participantCount} in = <strong style={{ color: "var(--brand)" }}>{money(potCents)}</strong>
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <tbody>
                {payouts.map((p) => {
                  const perMember = team && teamSize && teamSize > 1 ? splitAmongMembers(p.amountCents, teamSize)[0] : null;
                  return (
                    <tr key={p.place}>
                      <td style={{ padding: "3px 0", color: "var(--ink-soft)" }}>{ordinal(p.place)}</td>
                      <td style={{ padding: "3px 0", textAlign: "right", fontWeight: 600 }}>{money(p.amountCents)}</td>
                      <td style={{ padding: "3px 0 3px 12px", textAlign: "right", color: "var(--ink-soft)" }}>
                        {perMember != null ? `${money(perMember)} each` : team ? "split among team" : ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {team && teamSize && teamSize > 1 && <p className={styles.roundFormHint} style={{ marginTop: 6, marginBottom: 0 }}>Teams of {teamSize}.</p>}
          </div>
        ) : (
          <p className={styles.roundFormHint} style={{ marginTop: 14 }}>Set a buy-in on this contest to preview pot amounts.</p>
        )}
      </Modal>
    </>
  );
}
