"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import ContestParticipants from "@/components/v2/contests/ContestParticipants";
import ContestEntryPaid from "./ContestEntryPaid";
import { MIN_TEAMS_PER_PLAYER } from "@/lib/v2/contests/auction";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import AuctionPayouts from "./AuctionPayouts";
import type { AuctionState, AuctionPayouts as AuctionPayoutsData } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

/** A $-prefixed money input that reports whole cents on blur. */
function MoneyField({ label, defaultDollars, disabled, onCents }: { label: string; defaultDollars: number; disabled: boolean; onCents: (cents: number) => void }) {
  return (
    <label><span style={LABEL}>{label}</span>
      <span style={{ position: "relative", display: "block" }}>
        <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)" }}>$</span>
        <input className={styles.input} style={{ paddingLeft: 22 }} inputMode="decimal" defaultValue={String(defaultDollars)} disabled={disabled}
          onBlur={(e) => onCents(Math.round((Number(e.target.value) || 0) * 100))} />
      </span>
    </label>
  );
}

export default function AuctionManager({
  slug, apiBase, state, tournaments, payouts,
}: {
  slug: string; apiBase: string; state: AuctionState; tournaments: { id: string; name: string }[]; payouts: AuctionPayoutsData | null;
}) {
  const router = useRouter();
  const { config, participants, entities, currentId, onDeckId, onBlock, capacity, fieldReady, bundlesFrozen } = state;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Recorder form.
  const [entityId, setEntityId] = useState("");
  const [buyerId, setBuyerId] = useState(currentId ?? "");
  const [bid, setBid] = useState(String(config.bidIncrementCents / 100));

  // Live: refresh when anything on the board changes (other admins, grading).
  useEffect(() => subscribeToAuction(state.contest.id, config.tournamentId, () => router.refresh()), [state.contest.id, config.tournamentId, router]);

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

  async function assign(forEntityId?: string) {
    const lot = forEntityId ?? entityId;
    if (!lot || !buyerId) { setErr("Pick a team and a buyer"); return; }
    const cents = Math.round((Number(bid) || 0) * 100);
    if (await act({ action: "assign", entityId: lot, userId: buyerId, bidCents: cents })) {
      setEntityId(""); setBuyerId(""); setBid(String(config.bidIncrementCents / 100));
    }
  }

  const bundleCount = entities.filter((e) => e.bundledThrowIn).length;
  const setPoint = (i: number, cents: number) => {
    const arr = [config.payoutPointsCents[0] ?? 0, config.payoutPointsCents[1] ?? 0];
    arr[i] = cents;
    return act({ action: "settings", payout_points_cents: arr });
  };

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/contests`} className={styles.back}>← Contests</Link>
      <div className={styles.titleRow}><h1 className={styles.title}>{state.contest.name}</h1></div>
      <p className={styles.lede} style={{ marginTop: 2, color: "var(--ink-soft)" }}>
        Auction{state.tournament ? `, ${state.tournament.name}` : ""}{config.complete ? ", complete" : ""}
      </p>
      <Link href={`/new/${slug}/admin/contests/${state.contest.id}/board`} target="_blank" className={styles.linkAction} style={{ display: "inline-block", marginTop: 4 }}>Open projector board ↗</Link>

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
          <div>
            <MoneyField label="Buy-in (real money)" defaultDollars={config.entryCents / 100} disabled={busy} onCents={(c) => void act({ action: "settings", entry_cents: c })} />
            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-soft)", marginTop: 4 }}>What each player pays to enter. Tracked under &ldquo;Who&apos;s paid their entry&rdquo; below.</span>
          </div>
          <div className={styles.profileTwoCol}>
            <MoneyField label="Salary cap (fake bidding $)" defaultDollars={config.salaryCapCents / 100} disabled={busy} onCents={(c) => void act({ action: "settings", salary_cap_cents: c })} />
            <MoneyField label="Bid increment" defaultDollars={config.bidIncrementCents / 100} disabled={busy} onCents={(c) => void act({ action: "settings", bid_increment_cents: c })} />
          </div>
          <label><span style={LABEL}>First picker <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
            <select className={styles.selectInput} value={config.firstParticipantId ?? ""} disabled={busy} onChange={(e) => void act({ action: "settings", first_participant_id: e.target.value })}>
              <option value="">Random</option>
              {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
            </select>
            <span style={{ display: "block", fontSize: "0.72rem", color: "var(--ink-soft)", marginTop: 4 }}>Teams per player and free-team pairings are set automatically from the headcount.</span>
          </label>
          <div>
            <span style={LABEL}>Payouts <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(prize amounts, 0 = none)</span></span>
            <div className={styles.profileTwoCol}>
              <MoneyField label="Champion owner" defaultDollars={config.payoutChampionCents / 100} disabled={busy} onCents={(c) => void act({ action: "settings", payout_champion_cents: c })} />
              <MoneyField label="Runner-up owner" defaultDollars={config.payoutRunnerUpCents / 100} disabled={busy} onCents={(c) => void act({ action: "settings", payout_runner_up_cents: c })} />
            </div>
            <div className={styles.profileTwoCol} style={{ marginTop: 8 }}>
              <MoneyField label="Points, 1st" defaultDollars={(config.payoutPointsCents[0] ?? 0) / 100} disabled={busy} onCents={(c) => void setPoint(0, c)} />
              <MoneyField label="Points, 2nd" defaultDollars={(config.payoutPointsCents[1] ?? 0) / 100} disabled={busy} onCents={(c) => void setPoint(1, c)} />
            </div>
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

      {/* Entry (buy-in) collection */}
      {config.entryCents > 0 && (
        <div style={{ marginTop: 14 }}>
          <ContestEntryPaid orgId={state.contest.orgId} contestId={state.contest.id} title="Who's paid their entry" emptyText="No one's entered yet." />
        </div>
      )}

      {/* Capacity + auto-pairings */}
      {state.tournament && (
        <div style={{ marginTop: 14, padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
          {!fieldReady ? (
            <p className={styles.roundFormHint} style={{ margin: 0 }}>
              No full 64-team bracket loaded yet. Import the field in the tournament, then the teams-per-player and pairings appear here. First Four slots auction fine as &ldquo;winner of&rdquo; before the play-ins are played.
            </p>
          ) : (
            <>
              <p style={{ margin: 0, fontSize: "0.85rem" }}>
                <strong>{capacity.teamCount} teams</strong>, {capacity.participantCount} player{capacity.participantCount === 1 ? "" : "s"}
                {capacity.participantCount > 0 && <> → <strong>{capacity.teamsPerPlayer} per player</strong>, {capacity.bundleCount} free-team bundle{capacity.bundleCount === 1 ? "" : "s"}</>}.
                <span style={{ color: "var(--ink-soft)" }}> Max {capacity.maxParticipants} players.</span>
              </p>
              {capacity.overCapacity && <p className={styles.err} style={{ margin: "6px 0 0" }}>Over capacity: trim to {capacity.maxParticipants} players so everyone can get {MIN_TEAMS_PER_PLAYER} teams.</p>}
              {bundleCount > 0 && (
                <div style={{ marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
                    <span style={{ fontSize: "0.72rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: 0.3, color: "var(--ink-soft)" }}>Free-team pairings</span>
                    <span style={{ fontSize: "0.72rem", color: "var(--ink-soft)" }}>{bundlesFrozen ? "locked" : "auto, updates with headcount"}</span>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                    {entities.filter((e) => e.bundledThrowIn).map((e) => (
                      <span key={e.id} style={{ fontSize: "0.76rem", padding: "2px 8px", border: "1px solid var(--line)", borderRadius: 999 }}>
                        ({e.seed}) {e.name} <span style={{ color: "var(--ink-soft)" }}>+ ({e.bundledThrowIn!.seed}) {e.bundledThrowIn!.name} free</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

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
              <span><span style={{ fontSize: "0.7rem", textTransform: "uppercase", color: "var(--ink-soft)", fontWeight: 800 }}>Nominating</span> <strong style={{ color: "var(--brand)" }}>{nameOf(currentId)}</strong></span>
              {onDeckId && <span style={{ fontSize: "0.85rem", color: "var(--ink-soft)" }}>On deck: {nameOf(onDeckId)}</span>}
            </div>
          )}

          {!config.complete && (onBlock ? (
            <div style={{ border: "2px solid var(--brand)", borderRadius: 12, padding: 14, marginBottom: 16, background: "var(--card)" }}>
              <p style={{ fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: 0.4, fontWeight: 800, color: "var(--brand)", margin: 0 }}>On the block</p>
              <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0 12px" }}>
                {onBlock.logo_url && <img src={onBlock.logo_url} alt="" width={28} height={28} style={{ objectFit: "contain" }} />}
                <span style={{ fontSize: "1.15rem", fontWeight: 800 }}>({onBlock.seed}) {onBlock.name}</span>
                {onBlock.region && <span style={{ color: "var(--ink-soft)", fontSize: "0.85rem" }}>{onBlock.region}</span>}
              </div>
              {onBlock.bundledThrowIn && <p style={{ fontSize: "0.78rem", color: "var(--ink-soft)", marginTop: -8, marginBottom: 10 }}>Comes with ({onBlock.bundledThrowIn.seed}) {onBlock.bundledThrowIn.name} free.</p>}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end" }}>
                <label style={{ flex: "2 1 160px" }}><span style={LABEL}>Winner</span>
                  <select className={styles.selectInput} value={buyerId} onChange={(e) => setBuyerId(e.target.value)}>
                    <option value="">Pick a buyer…</option>
                    {participants.map((p) => <option key={p.userId} value={p.userId} disabled={p.done}>{p.name} ({money(p.remainingCents)} left{p.done ? ", done" : ""})</option>)}
                  </select>
                </label>
                <label style={{ flex: "1 1 90px" }}><span style={LABEL}>Winning bid</span>
                  <input className={styles.input} inputMode="decimal" step={config.bidIncrementCents / 100} value={bid} onChange={(e) => setBid(e.target.value.replace(/[^0-9.]/g, ""))} />
                </label>
                <button type="button" className={styles.create} disabled={busy || !buyerId} onClick={() => void assign(onBlock.id)}>Record sale</button>
                <button type="button" className={styles.createBtnGhost} disabled={busy} onClick={() => void act({ action: "clear_block" })}>Clear</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginBottom: 16 }}>
              <label style={{ flex: "2 1 220px" }}><span style={LABEL}>Lot nominated</span>
                <select className={styles.selectInput} value={entityId} onChange={(e) => setEntityId(e.target.value)}>
                  <option value="">Pick the lot up for bids…</option>
                  {available.map((e) => (
                    <option key={e.id} value={e.id}>
                      ({e.seed}) {e.name}{e.region ? `, ${e.region}` : ""}{e.bundledThrowIn ? ` (+ ${e.bundledThrowIn.name} free)` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className={styles.create} disabled={busy || !entityId} onClick={() => { void act({ action: "set_block", entityId }).then((ok) => { if (ok) setEntityId(""); }); }}>Put on the block</button>
            </div>
          ))}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 10 }}>
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
        </div>
      )}

      {payouts && <AuctionPayouts apiBase={apiBase} payouts={payouts} />}
    </div>
  );
}
