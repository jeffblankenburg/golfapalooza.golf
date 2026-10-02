"use client";

import { useState } from "react";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import type { MemberBalance } from "@/lib/v2/balances";
import { sourceLabel } from "@/lib/v2/balances";
import styles from "@/app/new/new.module.css";

export interface BalanceRow {
  userId: string;
  name: string;
  onRoster: boolean;
  owedCents: number;
  paidCents: number;
  balanceCents: number;
}

function money(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

const KINDS = [
  { kind: "payment", label: "Payment", needsDesc: false, methodish: true },
  { kind: "credit", label: "Credit", needsDesc: false, methodish: false },
  { kind: "winnings", label: "Winnings", needsDesc: false, methodish: false },
  { kind: "charge", label: "Manual charge", needsDesc: true, methodish: false },
  { kind: "expense", label: "Expense", needsDesc: true, methodish: false },
] as const;
const METHODS = ["Cash", "Venmo", "Zelle", "Check", "Other"];

export default function BalancesManager({ orgId, eventId, rows: initialRows }: { orgId: string; eventId: string; rows: BalanceRow[] }) {
  const base = `/api/v2/orgs/${orgId}/events/${eventId}`;
  const [rows, setRows] = useState<BalanceRow[]>(initialRows);
  const [openUser, setOpenUser] = useState<BalanceRow | null>(null);
  const [detail, setDetail] = useState<MemberBalance | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);

  // Record form
  const [kind, setKind] = useState<string>("payment");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("Venmo");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");

  const totals = rows.reduce((a, r) => ({ owed: a.owed + r.owedCents, paid: a.paid + r.paidCents, bal: a.bal + r.balanceCents }), { owed: 0, paid: 0, bal: 0 });

  async function openMember(r: BalanceRow) {
    setOpenUser(r); setDetail(null); setError(null); setLoading(true);
    setKind("payment"); setAmount(""); setMethod("Venmo"); setDescription(""); setNotes("");
    try {
      const res = await fetch(`${base}/balances/${r.userId}`);
      if (res.ok) setDetail((await res.json()).balance);
    } finally { setLoading(false); }
  }

  function syncRow(b: MemberBalance) {
    setRows((prev) => prev.map((x) => (x.userId === b.userId ? { ...x, owedCents: b.owedCents, paidCents: b.paidCents, balanceCents: b.balanceCents } : x)));
  }
  async function refreshDetail(userId: string) {
    const res = await fetch(`${base}/balances/${userId}`);
    if (res.ok) { const b = (await res.json()).balance as MemberBalance; setDetail(b); syncRow(b); }
  }

  async function record() {
    if (busy || !openUser) return;
    const dollars = Number(amount);
    if (!Number.isFinite(dollars) || dollars <= 0) { setError("Enter an amount"); return; }
    const def = KINDS.find((k) => k.kind === kind)!;
    if (def.needsDesc && !description.trim()) { setError("A charge needs a description"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/transactions`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: openUser.userId, kind, amountCents: Math.round(dollars * 100),
          method: def.methodish ? method : null,
          description: def.needsDesc ? description.trim() : null,
          notes: notes.trim() || null,
        }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
      setAmount(""); setDescription(""); setNotes("");
      await refreshDetail(openUser.userId);
    } finally { setBusy(false); }
  }

  async function del(txId: string) {
    if (busy || !openUser) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/transactions?txId=${encodeURIComponent(txId)}`, { method: "DELETE" });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not delete"); return; }
      setConfirmDel(null);
      await refreshDetail(openUser.userId);
    } finally { setBusy(false); }
  }

  const def = KINDS.find((k) => k.kind === kind)!;

  return (
    <div style={{ marginTop: 18 }}>
      {rows.length === 0 ? (
        <p className={styles.dnsHint}>No balances yet. They appear once members RSVP or pick options.</p>
      ) : (
        <div className={styles.balGrid}>
          <div className={styles.balHead}>
            <span>Member</span><span>Owed</span><span>Paid</span><span>Balance</span>
          </div>
          {rows.map((r) => (
            <button key={r.userId} type="button" className={styles.balRow} onClick={() => openMember(r)}>
              <span className={styles.balName}>{r.name}</span>
              <span className={styles.balNum}>{r.owedCents ? money(r.owedCents) : ""}</span>
              <span className={styles.balNum} data-paid="1">{r.paidCents ? money(r.paidCents) : ""}</span>
              <span className={styles.balNum} data-state={r.balanceCents > 0 ? "owes" : r.balanceCents < 0 ? "credit" : "settled"}>
                {r.balanceCents < 0 ? `(${money(-r.balanceCents)})` : money(r.balanceCents)}
              </span>
            </button>
          ))}
          <div className={styles.balTotals}>
            <span>Totals</span>
            <span className={styles.balNum}>{money(totals.owed)}</span>
            <span className={styles.balNum} data-paid="1">{money(totals.paid)}</span>
            <span className={styles.balNum} data-state={totals.bal > 0 ? "owes" : totals.bal < 0 ? "credit" : "settled"}>
              {totals.bal < 0 ? `(${money(-totals.bal)})` : money(totals.bal)}
            </span>
          </div>
        </div>
      )}

      <Modal open={!!openUser} title={openUser?.name || ""} onClose={() => (busy ? undefined : setOpenUser(null))}>
        {loading || !detail ? (
          <p className={styles.dnsHint} style={{ marginTop: 0 }}>Loading…</p>
        ) : (
          <>
            <div className={styles.balSummary}>
              <div><span className={styles.balSummaryLabel}>Owed</span><span className={styles.balSummaryVal}>{money(detail.owedCents)}</span></div>
              <div><span className={styles.balSummaryLabel}>Paid</span><span className={styles.balSummaryVal}>{money(detail.paidCents)}</span></div>
              <div><span className={styles.balSummaryLabel}>Balance</span><span className={styles.balSummaryVal} data-state={detail.balanceCents > 0 ? "owes" : detail.balanceCents < 0 ? "credit" : "settled"}>{detail.balanceCents < 0 ? `(${money(-detail.balanceCents)})` : money(detail.balanceCents)}</span></div>
            </div>

            {detail.charges.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className={styles.sectionLabel}>Charges</p>
                <div className={styles.memberList} style={{ marginTop: 4 }}>
                  {detail.charges.map((c, i) => (
                    <div key={i} className={styles.finRow}>
                      <div className={styles.finRowMain} style={{ minWidth: 0 }}>
                        <span className={styles.finRowName}>{c.label}{c.derived ? "" : ""}</span>
                        {c.sublabel && <span className={styles.cscAllMeta}>{c.sublabel}</span>}
                        {c.derived && <span className={styles.cscAllMeta}>Derived</span>}
                      </div>
                      <span className={styles.finRowAmount}>{money(c.amountCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {detail.payments.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <p className={styles.sectionLabel}>Payments &amp; credits</p>
                <div className={styles.memberList} style={{ marginTop: 4 }}>
                  {detail.payments.map((p) => (
                    <div key={p.id} className={styles.finRow}>
                      <div className={styles.finRowMain} style={{ minWidth: 0 }}>
                        <span className={styles.finRowName}>{p.description || sourceLabel(p.source)}{p.method ? ` (${p.method})` : ""}</span>
                        {p.notes && <span className={styles.cscAllMeta}>{p.notes}</span>}
                      </div>
                      <span className={styles.finRowAmount} data-credit="1">−{money(p.amountCents)}</span>
                      <button type="button" className={styles.removeBtn} onClick={() => setConfirmDel(p.id)} disabled={busy} style={{ marginLeft: 8 }}>Remove</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div style={{ marginTop: 18 }}>
              <p className={styles.sectionLabel}>Record</p>
              <div className={styles.field}>
                <label className={styles.label}>Type</label>
                <select className={styles.selectInput} value={kind} onChange={(e) => setKind(e.target.value)}>
                  {KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
                </select>
              </div>
              <div className={styles.profileTwoCol}>
                <div className={styles.field}>
                  <label className={styles.label}>Amount</label>
                  <input className={styles.input} inputMode="decimal" value={amount} placeholder="0.00"
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))} />
                </div>
                {def.methodish && (
                  <div className={styles.field}>
                    <label className={styles.label}>Method</label>
                    <select className={styles.selectInput} value={method} onChange={(e) => setMethod(e.target.value)}>
                      {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
              </div>
              {def.needsDesc && (
                <div className={styles.field}>
                  <label className={styles.label}>Description</label>
                  <input className={styles.input} value={description} maxLength={120} placeholder="e.g. Cart damage"
                    onChange={(e) => setDescription(e.target.value)} />
                </div>
              )}
              <div className={styles.field}>
                <label className={styles.label}>Notes <span className={styles.optional}>(optional)</span></label>
                <input className={styles.input} value={notes} maxLength={200} onChange={(e) => setNotes(e.target.value)} />
              </div>
              {error && <p className={styles.formError}>{error}</p>}
              <button type="button" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }} onClick={record}>
                {busy ? "Saving…" : "Record"}
              </button>
            </div>
          </>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title="Remove this entry?"
        message="This deletes the ledger entry and recomputes the balance."
        confirmLabel="Remove"
        destructive
        onConfirm={() => confirmDel && del(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  );
}
