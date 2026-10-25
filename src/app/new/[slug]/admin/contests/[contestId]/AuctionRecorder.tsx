"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import type { AuctionState } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

/**
 * Live auction administration — the fast draft runner on its own screen. One assign bar
 * (team → owner → price → Assign), an optional "put on the block" that lights the
 * projector board, and the buyer columns. Realtime; the detail page owns setup.
 */
export default function AuctionRecorder({ slug, apiBase, state, backHref }: {
  slug: string; apiBase: string; state: AuctionState; backHref: string;
}) {
  const router = useRouter();
  const { config, participants, entities, currentId, onDeckId, onBlock } = state;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [entityId, setEntityId] = useState(onBlock?.id ?? "");
  const [buyerId, setBuyerId] = useState("");
  const [bid, setBid] = useState(String(config.bidIncrementCents / 100));

  useEffect(() => subscribeToAuction(state.contest.id, config.tournamentId, () => router.refresh()), [state.contest.id, config.tournamentId, router]);

  async function act(body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/auction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Something went wrong."); setBusy(false); return false; }
      router.refresh(); setBusy(false); return true;
    } catch { setErr("Something went wrong."); setBusy(false); return false; }
  }

  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const available = entities.filter((e) => !e.ownerId && !e.eliminated);
  const lot = onBlock ?? available.find((e) => e.id === entityId) ?? null; // the team being recorded

  async function assign() {
    const id = lot?.id;
    if (!id || !buyerId) { setErr("Pick a team and an owner."); return; }
    if (await act({ action: "assign", entityId: id, userId: buyerId, bidCents: Math.round((Number(bid) || 0) * 100) })) {
      setEntityId(""); setBuyerId(""); setBid(String(config.bidIncrementCents / 100));
    }
  }

  const header = (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href={backHref} className={styles.back} style={{ margin: 0 }}>← Auction</Link>
        <Link href={`/new/${slug}/admin/contests/${state.contest.id}/board`} target="_blank" className={styles.linkAction} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          Board
        </Link>
      </div>
      <div className={styles.titleRow}><h1 className={styles.title}>{state.contest.name}, live</h1></div>
    </>
  );

  if (!state.tournament || entities.length === 0 || participants.length === 0) {
    return (
      <div className={styles.page}>
        {header}
        <p className={styles.dnsHint} style={{ marginTop: 16 }}>
          {!state.tournament ? "Bind a tournament in the auction settings first."
            : entities.length === 0 ? "That tournament has no teams yet — build its field under Manage tournaments."
            : "Add participants on the auction page before starting the draft."}
        </p>
        <Link href={backHref} className={styles.linkAction} style={{ marginTop: 10, display: "inline-block" }}>Back to the auction</Link>
      </div>
    );
  }

  const owners = (
    <select className={styles.selectInput} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
      <option value="">Owner…</option>
      {participants.map((p) => <option key={p.userId} value={p.userId} disabled={p.done}>{p.name} ({money(p.remainingCents)} left{p.done ? ", done" : ""})</option>)}
    </select>
  );
  const priceInput = <input className={styles.input} inputMode="decimal" step={config.bidIncrementCents / 100} value={bid} onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="Price" />;

  return (
    <div className={styles.page}>
      {header}

      {!config.complete && currentId && (
        <div style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "8px 14px", borderRadius: 10, background: "var(--brand-tint, #e8f2ec)", marginTop: 12 }}>
          <span><span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 800 }}>Nominating</span> <strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong></span>
          {onDeckId && <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>On deck: {nameOf(onDeckId)}</span>}
        </div>
      )}

      {err && <p className={styles.err} style={{ marginTop: 10, marginBottom: 0 }}>{err}</p>}

      {/* Assign bar — team, owner, price, Assign. */}
      {!config.complete && (
        <div style={{ marginTop: 14, border: "2px solid var(--brand)", borderRadius: 12, padding: 14, background: "var(--card)" }}>
          {onBlock ? (
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <span style={{ fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 800, color: "var(--brand)" }}>On the block</span>
              {onBlock.logo_url && <img src={onBlock.logo_url} alt="" width={26} height={26} style={{ objectFit: "contain" }} />}
              <span style={{ fontSize: "1.15rem", fontWeight: 800 }}>({onBlock.seed}) {onBlock.name}</span>
              {onBlock.bundledThrowIn && <span style={{ fontSize: "0.78rem", color: "var(--ink-soft)" }}>+ ({onBlock.bundledThrowIn.seed}) {onBlock.bundledThrowIn.name} free</span>}
              <button type="button" className={styles.linkAction} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer" }} disabled={busy} onClick={() => void act({ action: "clear_block" })}>Clear</button>
            </div>
          ) : (
            <label style={{ display: "block", marginBottom: 10 }}><span style={LABEL}>Team</span>
              <div style={{ display: "flex", gap: 8 }}>
                <select className={styles.selectInput} style={{ flex: 1 }} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                  <option value="">Pick a team…</option>
                  {available.map((e) => <option key={e.id} value={e.id}>({e.seed}) {e.name}{e.region ? `, ${e.region}` : ""}{e.bundledThrowIn ? ` (+ ${e.bundledThrowIn.name} free)` : ""}</option>)}
                </select>
                <button type="button" className={styles.createBtnGhost} style={{ whiteSpace: "nowrap" }} disabled={busy || !entityId} title="Show this team on the projector board" onClick={() => void act({ action: "set_block", entityId })}>On board</button>
              </div>
            </label>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
            <label style={{ flex: "2 1 160px" }}><span style={LABEL}>Owner</span>{owners}</label>
            <label style={{ flex: "1 1 90px" }}><span style={LABEL}>Price</span>{priceInput}</label>
            <button type="button" className={styles.createBtn} disabled={busy || !lot || !buyerId} onClick={() => void assign()}>Assign</button>
          </div>
        </div>
      )}

      {/* Buyer columns */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 16 }}>
        {participants.map((p) => (
          <div key={p.userId} style={{ border: `1px solid ${p.userId === currentId ? "var(--brand)" : "var(--line)"}`, borderRadius: 10, padding: 10, background: p.done ? "var(--brand-tint, #e8f2ec)" : "var(--card)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <strong style={{ fontSize: "0.9rem" }}>{p.name}</strong>
              <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--brand)" }}>{money(p.remainingCents)}</span>
            </div>
            <div style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginBottom: 6 }}>
              {p.paidTeams}/{config.teamsPerPlayer} lots{p.done ? ", done" : ""}{config.complete ? `, ${p.points} pts` : ""}
            </div>
            {p.teams.length === 0 ? <p style={{ fontSize: "0.78rem", color: "var(--ink-soft)", margin: 0 }}>No lots yet</p> : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {p.teams.map((t) => (
                  <div key={t.entityId} style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
                      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.name}</span>
                      <span style={{ fontWeight: 700 }}>{money(t.bidCents)}</span>
                      {!config.complete && (
                        <button type="button" aria-label="Undo" title="Undo (releases any free team too)" disabled={busy} onClick={() => void act({ action: "unassign", entityId: t.entityId })}
                          style={{ border: "none", background: "none", color: "var(--ink-soft)", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                      )}
                    </div>
                    {t.freeName && <span style={{ fontSize: "0.7rem", color: "var(--ink-soft)" }}>+ {t.freeName} free</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Complete / reopen */}
      <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <button type="button" className={config.complete ? styles.createBtnGhost : styles.createBtn} disabled={busy} onClick={() => void act({ action: "complete", complete: !config.complete })}>
          {config.complete ? "Reopen auction" : "Mark auction complete"}
        </button>
        <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
          {config.complete ? "The auction is closed. Reopen it to keep assigning teams." : "Closes the draft and switches the board to final standings. You can reopen it later."}
        </p>
      </div>
    </div>
  );
}
