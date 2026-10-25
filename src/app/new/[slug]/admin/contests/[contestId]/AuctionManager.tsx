"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import ContestParticipants from "@/components/v2/contests/ContestParticipants";
import ContestEntryPaid from "./ContestEntryPaid";
import { ContestTypeIcon } from "@/app/new/_components/contest-card/ContestCard";
import { MIN_TEAMS_PER_PLAYER, SCORING_MODES, AUCTION_PAYOUT_SLOTS } from "@/lib/v2/contests/auction";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import PayoutSplitsEditor from "../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
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
  slug, apiBase, state, tournaments, payouts, payoutSplits, backHref,
}: {
  slug: string; apiBase: string; state: AuctionState; tournaments: { id: string; name: string }[]; payouts: AuctionPayoutsData | null; payoutSplits: PayoutSplit[]; backHref: string;
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
  // Payouts save to the shared payout_splits column via the generic contest PATCH, same
  // as every other contest.
  async function savePayoutSplits(splits: PayoutSplit[]) {
    setErr(null);
    try {
      const res = await fetch(apiBase, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ payout_splits: splits }) });
      if (!res.ok) setErr((await res.json().catch(() => ({}))).error || "Could not save payouts");
      else router.refresh();
    } catch { setErr("Something went wrong."); }
  }

  return (
    <div className={styles.page}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <Link href={backHref} className={styles.back} style={{ margin: 0 }}>← Contests</Link>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: "0.85rem", fontWeight: 700, color: "var(--ink-soft)" }}>
          <ContestTypeIcon kind="auction" size={16} /> Auction
        </span>
      </div>
      <div className={styles.titleRow} style={{ justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <h1 className={styles.title} style={{ minWidth: 0 }}>{state.contest.name}</h1>
        <Link href={`/new/${slug}/admin/contests/${state.contest.id}/board`} target="_blank" className={styles.linkAction} style={{ whiteSpace: "nowrap", display: "inline-flex", alignItems: "center", gap: 4 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>
          Board
        </Link>
      </div>

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
          <label>
            <span style={LABEL}>Scoring <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(how a team win scores)</span></span>
            <select className={styles.selectInput} value={config.scoringMode} disabled={busy} onChange={(e) => void act({ action: "settings", scoring_mode: e.target.value })}>
              {SCORING_MODES.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
            </select>
          </label>
          <div>
            <span style={LABEL}>Payouts <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(% of pot, flat $, or remainder)</span></span>
            <PayoutSplitsEditor value={payoutSplits} labels={AUCTION_PAYOUT_SLOTS.map((s) => s.label)} onSave={(s) => void savePayoutSplits(s)} disabled={busy} />
            {config.entryCents > 0 && (
              <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
                Pot: {money(config.entryCents)} × {participants.length} = <strong style={{ color: "var(--brand)" }}>{money(config.entryCents * participants.length)}</strong>
              </p>
            )}
          </div>
        </div>
      </details>

      {/* Participants */}
      <div style={{ marginTop: 14 }}>
        <ContestParticipants apiBase={apiBase} />
      </div>

      {/* Draft order */}
      <div style={{ marginTop: 14 }}>
        <p className={styles.sectionLabel} style={{ margin: 0 }}>Draft order</p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap", marginTop: 6 }}>
          <label style={{ flex: "1 1 180px" }}><span style={LABEL}>First picker <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(optional)</span></span>
            <select className={styles.selectInput} value={config.firstParticipantId ?? ""} disabled={busy} onChange={(e) => void act({ action: "settings", first_participant_id: e.target.value })}>
              <option value="">None (all randomized)</option>
              {participants.map((p) => <option key={p.userId} value={p.userId}>{p.name}</option>)}
            </select>
          </label>
          <button type="button" className={styles.createBtnGhost} disabled={busy} onClick={() => void act({ action: "shuffle" })}>Randomize throwout order</button>
        </div>
        <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
          Randomize as often as you like. The first picker (if set) always throws first; everyone else is shuffled.
        </p>
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

      {/* Complete / reopen */}
      {state.tournament && (
        <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
          <button type="button" className={config.complete ? styles.createBtnGhost : styles.create} disabled={busy} onClick={() => void act({ action: "complete", complete: !config.complete })}>
            {config.complete ? "Reopen auction" : "Mark auction complete"}
          </button>
          <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
            {config.complete
              ? "The auction is closed. Reopen it to keep assigning teams."
              : "Closes the draft and switches the board to final standings. You can reopen it later."}
          </p>
        </div>
      )}
    </div>
  );
}
