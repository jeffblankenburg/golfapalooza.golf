"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import ContestParticipants from "@/components/v2/contests/ContestParticipants";
import ContestEntryPaid from "./ContestEntryPaid";
import { ContestTypeIcon } from "@/app/new/_components/contest-card/ContestCard";
import { MIN_TEAMS_PER_PLAYER, AUCTION_PAYOUT_SLOTS } from "@/lib/v2/contests/auction";
import { subscribeToAuction } from "@/lib/v2/realtime/auction-channel";
import PayoutSplitsEditor from "../../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import type { PayoutSplit } from "@/lib/v2/contests/payouts";
import AuctionPayouts from "./AuctionPayouts";
import type { AuctionState, AuctionPayouts as AuctionPayoutsData } from "@/lib/v2/contests/auction-server";

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { maximumFractionDigits: cents % 100 === 0 ? 0 : 2 })}`;
const LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

export default function AuctionManager({
  slug, apiBase, state, payouts, payoutSplits, backHref,
}: {
  slug: string; apiBase: string; state: AuctionState; payouts: AuctionPayoutsData | null; payoutSplits: PayoutSplit[]; backHref: string;
}) {
  const router = useRouter();
  const { config, participants, entities, capacity, fieldReady, bundlesFrozen } = state;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Live: refresh when participants / results change (keeps the setup view current).
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

  const bundleCount = entities.filter((e) => e.bundledThrowIn).length;
  const potCents = state.buyInCents * participants.length;

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
        <Link href={`/new/${slug}/admin/contests/${state.contest.id}/live`} className={styles.createBtn} style={{ whiteSpace: "nowrap" }}>Run live auction →</Link>
      </div>

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

      {/* Entry (buy-in) collection — group auctions track it here; event auctions track
          payment in the event's Financials (the buy-in is part of the trip money). */}
      {!state.isEvent && config.entryCents > 0 && (
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

      {/* Payouts config — here on the detail page, where the headcount + pot are visible. */}
      <div style={{ marginTop: 18 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <p className={styles.sectionLabel} style={{ margin: 0 }}>Payouts <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(share of the pot)</span></p>
          <span style={{ fontSize: "0.82rem", color: "var(--ink-soft)" }}>
            {participants.length} player{participants.length === 1 ? "" : "s"}, pot <strong style={{ color: "var(--brand)" }}>{money(potCents)}</strong>
          </span>
        </div>
        <div style={{ marginTop: 8 }}>
          <PayoutSplitsEditor value={payoutSplits} labels={AUCTION_PAYOUT_SLOTS.map((s) => s.label)} onSave={(s) => void savePayoutSplits(s)} disabled={busy} />
        </div>
      </div>

      {payouts && <AuctionPayouts apiBase={apiBase} payouts={payouts} />}
    </div>
  );
}
