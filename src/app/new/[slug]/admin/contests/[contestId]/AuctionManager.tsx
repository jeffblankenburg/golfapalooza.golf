"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import ContestParticipants from "@/components/v2/contests/ContestParticipants";
import type { AuctionState } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

export default function AuctionManager({
  slug, apiBase, state, tournaments,
}: {
  slug: string; apiBase: string; state: AuctionState; tournaments: { id: string; name: string }[];
}) {
  const router = useRouter();
  const { config, participants, entities, currentId, onDeckId } = state;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Recorder form.
  const [entityId, setEntityId] = useState("");
  const [buyerId, setBuyerId] = useState(currentId ?? "");
  const [bid, setBid] = useState(String(config.bidIncrementCents / 100));

  async function act(body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${apiBase}/auction`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Something went wrong."); setBusy(false); return false; }
      router.refresh();
      setBusy(false);
      return true;
    } catch { setErr("Something went wrong."); setBusy(false); return false; }
  }

  const nameOf = (uid: string | null) => participants.find((p) => p.userId === uid)?.name ?? "";
  const available = entities.filter((e) => !e.ownerId && !e.eliminated);

  async function assign(bonus = false) {
    if (!entityId || !buyerId) { setErr("Pick a team and a buyer"); return; }
    const cents = bonus ? 0 : Math.round((Number(bid) || 0) * 100);
    if (await act({ action: "assign", entityId, userId: buyerId, bidCents: cents })) {
      setEntityId(""); setBid(String(config.bidIncrementCents / 100));
    }
  }

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/contests`} className={styles.back}>← Contests</Link>
      <div className={styles.titleRow}><h1 className={styles.title}>{state.contest.name}</h1></div>
      <p className={styles.lede} style={{ marginTop: 2, color: "var(--ink-soft)" }}>
        Auction{state.tournament ? `, ${state.tournament.name}` : ""}{config.complete ? ", complete" : ""}
      </p>

      {/* Settings */}
      <details style={{ marginTop: 14, border: "1px solid var(--line)", borderRadius: 12, overflow: "hidden" }} open={!state.tournament}>
        <summary style={{ padding: "12px 14px", cursor: "pointer", fontWeight: 700 }}>Settings</summary>
        <div style={{ padding: "0 14px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
          <label>
            <span style={LABEL}>Tournament (the team field)</span>
            <select className={styles.selectInput} value={config.tournamentId ?? ""} disabled={busy} onChange={(e) => void act({ action: "settings", tournament_id: e.target.value })}>
              <option value="">Choose a tournament…</option>
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            <Link href={`/new/${slug}/admin/tournaments`} className={styles.linkAction} style={{ display: "inline-block", marginTop: 4 }}>Manage tournaments</Link>
          </label>
          <div className={styles.profileTwoCol}>
            <label><span style={LABEL}>Salary cap</span>
              <span style={{ position: "relative", display: "block" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}>$</span>
                <input className={styles.input} style={{ paddingLeft: 22 }} inputMode="decimal" defaultValue={String(config.salaryCapCents / 100)} disabled={busy}
                  onBlur={(e) => void act({ action: "settings", salary_cap_cents: Math.round((Number(e.target.value) || 0) * 100) })} />
              </span>
            </label>
            <label><span style={LABEL}>Bid increment</span>
              <span style={{ position: "relative", display: "block" }}>
                <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}>$</span>
                <input className={styles.input} style={{ paddingLeft: 22 }} inputMode="decimal" defaultValue={String(config.bidIncrementCents / 100)} disabled={busy}
                  onBlur={(e) => void act({ action: "settings", bid_increment_cents: Math.round((Number(e.target.value) || 0) * 100) })} />
              </span>
            </label>
          </div>
          <div className={styles.profileTwoCol}>
            <label><span style={LABEL}>Teams per player</span>
              <input className={styles.input} inputMode="numeric" defaultValue={String(config.teamsPerPlayer)} disabled={busy}
                onBlur={(e) => void act({ action: "settings", teams_per_player: Number(e.target.value) || 3 })} />
            </label>
            <label><span style={LABEL}>First picker <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
              <select className={styles.selectInput} value={config.firstParticipantId ?? ""} disabled={busy} onChange={(e) => void act({ action: "settings", first_participant_id: e.target.value })}>
                <option value="">Random</option>
                {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button type="button" className={styles.createBtnGhost} disabled={busy} onClick={() => void act({ action: "shuffle" })}>
              {config.orderSeed ? "Re-roll order" : "Roll throwout order"}
            </button>
            <button type="button" className={config.complete ? styles.createBtnGhost : styles.create} disabled={busy} onClick={() => void act({ action: "complete", complete: !config.complete })}>
              {config.complete ? "Reopen auction" : "Mark complete"}
            </button>
          </div>
        </div>
      </details>

      {/* Participants */}
      <div style={{ marginTop: 14 }}>
        <ContestParticipants apiBase={apiBase} />
      </div>

      {err && <p className={styles.err} style={{ marginTop: 10 }}>{err}</p>}

      {/* Recorder */}
      {!state.tournament ? (
        <p className={styles.dnsHint} style={{ marginTop: 16 }}>Bind a tournament in Settings to load the team field.</p>
      ) : entities.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 16 }}>That tournament has no teams yet. Build its field under Manage tournaments.</p>
      ) : participants.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 16 }}>Add participants above to start the draft.</p>
      ) : (
        <div style={{ marginTop: 18 }}>
          {!config.complete && currentId && (
            <div style={{ display: "flex", gap: 16, alignItems: "baseline", padding: "10px 14px", borderRadius: 10, background: "var(--brand-tint, #e8f2ec)", marginBottom: 12 }}>
              <span><span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 800 }}>Up now</span> <strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong></span>
              {onDeckId && <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>On deck: {nameOf(onDeckId)}</span>}
            </div>
          )}

          {!config.complete && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
              <label style={{ flex: "2 1 200px" }}><span style={LABEL}>Team</span>
                <select className={styles.selectInput} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                  <option value="">Pick a team…</option>
                  {available.map((e) => <option key={e.id} value={e.id}>({e.seed}) {e.name}{e.region ? ` — ${e.region}` : ""}</option>)}
                </select>
              </label>
              <label style={{ flex: "2 1 160px" }}><span style={LABEL}>Buyer</span>
                <select className={styles.selectInput} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                  <option value="">Pick a buyer…</option>
                  {participants.map((p) => <option key={p.userId} value={p.userId} disabled={p.done}>{p.name} ({money(p.remainingCents)} left{p.done ? ", done" : ""})</option>)}
                </select>
              </label>
              <label style={{ flex: "1 1 90px" }}><span style={LABEL}>Bid</span>
                <input className={styles.input} inputMode="decimal" step={config.bidIncrementCents / 100} value={bid} onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ""))} />
              </label>
              <button type="button" className={styles.create} disabled={busy || !entityId || !buyerId} onClick={() => void assign(false)}>Assign</button>
              <button type="button" className={styles.createBtnGhost} disabled={busy || !entityId || !buyerId} onClick={() => void assign(true)} title="Free bonus team ($0)">Bonus ($0)</button>
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
            {participants.map((p) => (
              <div key={p.userId} style={{ border: `1px solid ${p.userId === currentId ? "var(--brand)" : "var(--line)"}`, borderRadius: 10, padding: 10, background: p.done ? "var(--brand-tint, #e8f2ec)" : "var(--card)" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <strong style={{ fontSize: "0.9rem" }}>{p.name}</strong>
                  <span style={{ fontSize: "0.9rem", fontWeight: 800, color: "var(--brand)" }}>{money(p.remainingCents)}</span>
                </div>
                <div style={{ fontSize: "0.7rem", color: "var(--ink-soft)", marginBottom: 6 }}>
                  {p.paidTeams}/{config.teamsPerPlayer} teams{p.done ? " · done" : ""}{config.complete ? `, ${p.points} pts` : ""}
                </div>
                {p.teams.length === 0 ? <p style={{ fontSize: "0.78rem", color: "var(--ink-soft)", margin: 0 }}>No teams yet</p> : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {p.teams.map((t) => (
                      <div key={t.entityId} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "0.8rem" }}>
                        <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>({t.seed}) {t.name}</span>
                        <span style={{ fontWeight: 700, color: t.bonus ? "var(--ink-soft)" : "var(--ink)" }}>{t.bonus ? "FREE" : money(t.bidCents)}</span>
                        {!config.complete && (
                          <button type="button" aria-label="Undo" title="Undo" disabled={busy} onClick={() => void act({ action: "unassign", entityId: t.entityId })}
                            style={{ border: "none", background: "none", color: "var(--ink-soft)", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
