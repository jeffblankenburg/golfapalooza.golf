"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import type { AuctionState, AuctionEntity, AuctionParticipant } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** The selected team (on-block or picked), shown with its logo/seed/name. */
function SelectedTeam({ lot, onBoard, onClear, busy }: { lot: AuctionEntity; onBoard: (() => void) | null; onClear: () => void; busy: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 4px" }}>
      {lot.logo_url && <img src={lot.logo_url} alt="" width={30} height={30} style={{ objectFit: "contain" }} />}
      <span style={{ fontSize: "1.15rem", fontWeight: 800, flex: 1, minWidth: 0 }}>({lot.seed}) {lot.name}</span>
      {lot.bundledThrowIn && <span style={{ fontSize: "0.74rem", color: "var(--ink-soft)" }}>+ ({lot.bundledThrowIn.seed}) {lot.bundledThrowIn.name} free</span>}
      {onBoard && <button type="button" className={styles.createBtnGhost} style={{ padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy} title="Show on the projector board" onClick={onBoard}>On board</button>}
      <button type="button" aria-label="Change team" title="Change team" className={styles.linkAction} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }} disabled={busy} onClick={onClear}>Change</button>
    </div>
  );
}

/**
 * Live auction administration — the fast draft runner. Pick a team (alphabetical, with
 * logos), pick an owner, pick a price (increments up to what the owner can spend), Assign.
 * Realtime; the detail page owns setup.
 */
export default function AuctionRecorder({ slug, apiBase, state, backHref }: {
  slug: string; apiBase: string; state: AuctionState; backHref: string;
}) {
  const router = useRouter();
  const { config, participants, entities, currentId, onDeckId, onBlock } = state;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [entityId, setEntityId] = useState("");
  const [buyerId, setBuyerId] = useState("");
  const [bid, setBid] = useState(String(config.bidIncrementCents / 100));
  const [query, setQuery] = useState("");

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
  const roster: AuctionParticipant[] = [...participants].sort(byName); // columns + owner dropdown, alphabetical
  const available = [...entities].filter((e) => !e.ownerId && !e.eliminated).sort(byName);
  const lot = onBlock ?? available.find((e) => e.id === entityId) ?? null;

  // Price options: 0 up to the most the chosen owner can spend (leave the increment for
  // each team they still need to buy). Falls back to the cap when no owner's picked.
  const inc = config.bidIncrementCents;
  const buyer = participants.find((p) => p.userId === buyerId) ?? null;
  const needs = buyer ? Math.max(1, config.teamsPerPlayer - buyer.paidTeams) : config.teamsPerPlayer;
  const budget = buyer ? buyer.remainingCents : config.salaryCapCents;
  const maxBid = Math.max(0, budget - (needs - 1) * inc);
  const priceOptions: number[] = [];
  for (let c = 0; c <= maxBid && inc > 0; c += inc) priceOptions.push(c);

  async function assign() {
    if (!lot || !buyerId) { setErr("Pick a team and an owner."); return; }
    if (await act({ action: "assign", entityId: lot.id, userId: buyerId, bidCents: Math.round((Number(bid) || 0) * 100) })) {
      setEntityId(""); setBuyerId(""); setBid(String(inc / 100)); setQuery("");
    }
  }

  const filtered = query ? available.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) : available;

  if (!state.tournament || entities.length === 0 || participants.length === 0) {
    return (
      <div className={styles.page} style={{ paddingTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Link href={backHref} className={styles.back} style={{ margin: 0 }}>← Auction</Link>
        </div>
        <p className={styles.dnsHint} style={{ marginTop: 16 }}>
          {!state.tournament ? "Bind a tournament in the auction settings first."
            : entities.length === 0 ? "That tournament has no teams yet — build its field under Manage tournaments."
            : "Add participants on the auction page before starting the draft."}
        </p>
      </div>
    );
  }

  return (
    <div className={styles.page} style={{ paddingTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href={backHref} className={styles.back} style={{ margin: 0 }}>← Auction</Link>
        <Link href={`/new/${slug}/admin/contests/${state.contest.id}/board`} target="_blank" className={styles.linkAction} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          Board
        </Link>
      </div>
      <h1 style={{ fontSize: "1.45rem", fontWeight: 800, margin: "6px 0 0" }}>{state.contest.name}, live</h1>

      {!config.complete && currentId && (
        <div style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "8px 14px", borderRadius: 10, background: "var(--brand-tint, #e8f2ec)", marginTop: 10 }}>
          <span><span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 800 }}>Nominating</span> <strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong></span>
          {onDeckId && <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>On deck: {nameOf(onDeckId)}</span>}
        </div>
      )}

      {err && <p className={styles.err} style={{ marginTop: 10, marginBottom: 0 }}>{err}</p>}

      {/* Assign */}
      {!config.complete && (
        <div style={{ marginTop: 12, border: "2px solid var(--brand)", borderRadius: 12, padding: 12, background: "var(--card)" }}>
          {lot ? (
            <SelectedTeam lot={lot} busy={busy} onClear={() => { if (onBlock) void act({ action: "clear_block" }); else setEntityId(""); }} onBoard={onBlock ? null : () => void act({ action: "set_block", entityId })} />
          ) : (
            <>
              <input className={styles.input} style={{ width: "100%", marginBottom: 6 }} placeholder="Search teams…" value={query} onChange={(e) => setQuery(e.target.value)} />
              <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 8 }}>
                {filtered.map((e, i) => (
                  <button key={e.id} type="button" onClick={() => setEntityId(e.id)}
                    style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "8px 10px", background: "none", border: "none", borderTop: i === 0 ? "none" : "1px solid var(--line)", cursor: "pointer", fontSize: "0.92rem" }}>
                    {e.logo_url ? <img src={e.logo_url} alt="" width={22} height={22} style={{ objectFit: "contain", flexShrink: 0 }} /> : <span style={{ width: 22, flexShrink: 0 }} />}
                    <span style={{ fontWeight: 800, color: "var(--ink-soft)", width: 20, flexShrink: 0 }}>{e.seed}</span>
                    <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}{e.bundledThrowIn ? ` (+ ${e.bundledThrowIn.name} free)` : ""}</span>
                  </button>
                ))}
                {filtered.length === 0 && <p className={styles.roundFormHint} style={{ margin: 0, padding: 10 }}>No teams match.</p>}
              </div>
            </>
          )}

          {lot && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginTop: 8 }}>
              <label style={{ flex: "2 1 150px" }}><span style={LABEL}>Owner</span>
                <select className={styles.selectInput} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                  <option value="">Owner…</option>
                  {roster.map((p) => <option key={p.userId} value={p.userId} disabled={p.done}>{p.name} ({money(p.remainingCents)} left{p.done ? ", done" : ""})</option>)}
                </select>
              </label>
              <label style={{ flex: "1 1 90px" }}><span style={LABEL}>Price</span>
                <select className={styles.selectInput} value={bid} onChange={(e) => setBid(e.target.value)}>
                  {priceOptions.map((c) => <option key={c} value={String(c / 100)}>{money(c)}</option>)}
                </select>
              </label>
              <button type="button" className={styles.createBtn} disabled={busy || !buyerId} onClick={() => void assign()}>Assign</button>
            </div>
          )}
        </div>
      )}

      {/* Buyer columns (alphabetical) */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10, marginTop: 16 }}>
        {roster.map((p) => (
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
      </div>
    </div>
  );
}
