"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/new/new.module.css";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { FBS_TEAMS, getTeamLogoUrl } from "@/lib/data/fbs-teams";
import { computePickemPayouts, type PayoutSplit } from "@/lib/v2/contests/pickem";
import PayoutSplitsEditor, { ordinal } from "./PayoutSplitsEditor";
/* eslint-disable @next/next/no-img-element */

const money = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: cents % 100 === 0 ? 0 : 2, maximumFractionDigits: 2 })}`;

interface Game {
  id: string;
  away_team: string; home_team: string;
  away_logo_url: string | null; home_logo_url: string | null;
  spread: number | null; favorite: "away" | "home" | null;
  game_time: string | null; tv_channel: string | null;
  is_tiebreaker: boolean;
  away_score: number | null; home_score: number | null;
  sort_order: number;
}

/** Searchable team picker: type to filter the catalog; rows show logo + color + conference. */
function TeamCombobox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [text, setText] = useState(value);
  const [open, setOpen] = useState(false);
  useEffect(() => { setText(value); }, [value]); // re-sync when the parent clears after an add
  const selected = FBS_TEAMS.find((t) => t.shortName === value) || null;
  const q = text.trim().toLowerCase();
  const matches = (q
    ? FBS_TEAMS.filter((t) => [t.shortName, t.name, t.abbreviation, t.conference].some((s) => s.toLowerCase().includes(q)))
    : FBS_TEAMS
  ).slice(0, 14);
  return (
    <div style={{ position: "relative" }}>
      <div className={styles.comboField}>
        {selected ? <img src={getTeamLogoUrl(selected)} alt="" className={styles.comboLogo} /> : null}
        {selected ? <span className={styles.comboDot} style={{ background: selected.primaryColor }} /> : null}
        <input
          className={styles.comboInput}
          value={text}
          placeholder={placeholder}
          onChange={(e) => { setText(e.target.value); setOpen(true); if (!e.target.value) onChange(""); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
        />
      </div>
      {open && matches.length > 0 && (
        <div className={styles.comboList}>
          {matches.map((t) => (
            <button key={t.shortName} type="button" className={styles.comboItem}
              onMouseDown={(e) => { e.preventDefault(); onChange(t.shortName); setText(t.shortName); setOpen(false); }}>
              <img src={getTeamLogoUrl(t)} alt="" className={styles.comboLogo} />
              <span className={styles.comboDot} style={{ background: t.primaryColor }} />
              <span className={styles.comboItemName}>{t.shortName}</span>
              <span className={styles.comboItemConf}>{t.conference}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PickemAdmin({ slug, orgId, eventId, contestId, initialStatus, initialFeeCents, initialSplits, enrolledCount }: {
  slug: string; orgId: string; eventId: string; contestId: string; initialStatus: string;
  initialFeeCents: number; initialSplits: PayoutSplit[]; enrolledCount: number;
}) {
  const base = `/api/v2/orgs/${orgId}/events/${eventId}/contests/${contestId}`;
  const adminBase = `/new/${slug}/admin/events/${eventId}/contests/${contestId}`;
  const [games, setGames] = useState<Game[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [scoreDraft, setScoreDraft] = useState<Record<string, { away: string; home: string }>>({});

  // Money: entry fee (the contest buy-in members pay via an Option) + payout splits.
  const [fee, setFee] = useState(initialFeeCents ? String(initialFeeCents / 100) : "");
  const [splits, setSplits] = useState<PayoutSplit[]>(initialSplits || []);
  const feeCents = Math.round((Number(fee) || 0) * 100);
  const potCents = feeCents * enrolledCount;
  const payouts = computePickemPayouts(potCents, splits);

  // Add-game form
  const [away, setAway] = useState("");
  const [home, setHome] = useState("");
  const [favorite, setFavorite] = useState<"away" | "home">("home");
  const [spread, setSpread] = useState("");
  const [gameTime, setGameTime] = useState("");
  const [tv, setTv] = useState("");
  const [isTb, setIsTb] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`${base}/pickem`);
    if (!res.ok) return;
    const data: Game[] = (await res.json()).games || [];
    setGames(data);
    setScoreDraft(Object.fromEntries(data.map((g) => [g.id, {
      away: g.away_score != null ? String(g.away_score) : "",
      home: g.home_score != null ? String(g.home_score) : "",
    }])));
  }, [base]);
  useEffect(() => { load(); }, [load]);

  async function addGame(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!away || !home) { setError("Pick both teams"); return; }
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/pickem`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          away_team: away, home_team: home, favorite,
          spread: spread.trim() ? Number(spread) : undefined,
          game_time: gameTime ? new Date(gameTime).toISOString() : null,
          tv_channel: tv.trim() || null, is_tiebreaker: isTb,
        }),
      });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not add"); return; }
      setAway(""); setHome(""); setSpread(""); setGameTime(""); setTv(""); setIsTb(false);
      setAddOpen(false);
      await load();
    } finally { setBusy(false); }
  }

  async function patchGame(gameId: string, patch: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/pickem`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ gameId, ...patch }) });
      if (!res.ok) { setError((await res.json().catch(() => ({}))).error || "Could not save"); return; }
      await load();
    } finally { setBusy(false); }
  }

  function setScore(gameId: string, side: "away" | "home", val: string) {
    setScoreDraft((d) => {
      const cur = d[gameId] || { away: "", home: "" };
      return { ...d, [gameId]: { ...cur, [side]: val.replace(/[^0-9]/g, "") } };
    });
  }
  function saveResult(g: Game) {
    const d = scoreDraft[g.id] || { away: "", home: "" };
    const a = d.away.trim() === "" ? null : Math.max(0, Math.round(Number(d.away)));
    const h = d.home.trim() === "" ? null : Math.max(0, Math.round(Number(d.home)));
    if (a === g.away_score && h === g.home_score) return; // no change
    const winning_team = a != null && h != null ? (h > a ? "home" : a > h ? "away" : null) : null;
    patchGame(g.id, { away_score: a, home_score: h, winning_team });
  }

  async function del(gameId: string) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/pickem?gameId=${gameId}`, { method: "DELETE" });
      if (!res.ok) { setError("Could not delete"); return; }
      setConfirmDel(null);
      await load();
    } finally { setBusy(false); }
  }

  async function toggleOpen() {
    const next = status === "active" ? "draft" : "active";
    setBusy(true); setError(null);
    const prev = status;
    setStatus(next);
    try {
      const res = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: next }) });
      if (!res.ok) throw new Error();
    } catch { setStatus(prev); setError("Could not change status"); }
    finally { setBusy(false); }
  }

  async function patchContest(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const res = await fetch(base, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError((await res.json().catch(() => ({}))).error || "Could not save");
    } finally { setBusy(false); }
  }
  function saveSplits(next: PayoutSplit[]) {
    setSplits(next);
    void patchContest({ payout_splits: next });
  }
  async function reset() {
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/pickem/reset`, { method: "POST" });
      if (!res.ok) { setError("Could not reset"); return; }
      setConfirmReset(false);
      await load();
    } finally { setBusy(false); }
  }

  return (
    <div style={{ marginTop: 8 }}>
      <div className={styles.cscAcc} style={{ marginBottom: 16 }}>
        <div className={styles.cscAccBody} style={{ paddingTop: 12 }}>
          <label className={styles.profileToggle} style={{ marginTop: 0 }}>
            <input type="checkbox" checked={status === "active"} onChange={toggleOpen} disabled={busy} />
            <span>Open to members {status === "active" ? "(visible, picks allowed)" : "(hidden)"}</span>
          </label>
        </div>
      </div>

      <Link href={`${adminBase}/players`} className={styles.cscAcc} style={{ display: "block", marginBottom: 16, textDecoration: "none" }}>
        <div className={styles.cscAccHead}>
          <span className={styles.cscAllMain}>
            <span className={styles.cscAllName}>Players</span>
            <span className={styles.cscAllPlayers}>{enrolledCount} enrolled, add on-site opt-ins or remove</span>
          </span>
          <svg className={styles.cscAccChevron} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
        </div>
      </Link>

      <div className={styles.cscAcc} data-open={moneyOpen || undefined} style={{ marginBottom: 16 }}>
        <button type="button" className={styles.cscAccHead} onClick={() => setMoneyOpen((v) => !v)} aria-expanded={moneyOpen}>
          <span className={styles.cscAllMain}>
            <span className={styles.cscAllName}>Entry fee &amp; payouts</span>
            <span className={styles.cscAllPlayers}>{feeCents > 0 ? `${money(feeCents)} entry${potCents ? `, pot ${money(potCents)}` : ""}` : "No entry fee"}</span>
          </span>
          <svg className={styles.cscAccChevron} data-open={moneyOpen || undefined} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" /></svg>
        </button>
        {moneyOpen && (
          <div className={styles.cscAccBody}>
            <div className={styles.field}>
              <label className={styles.label}>Entry fee</label>
              <input className={styles.input} inputMode="decimal" value={fee} placeholder="0"
                onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))}
                onBlur={() => patchContest({ entry_amount_cents: feeCents || null })} />
              <p className={styles.roundFormHint}>Members pay this by choosing Pick&apos;em as an option. Pay winners on the Balances screen.</p>
            </div>
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Payout splits (% of pot)</label>
              <PayoutSplitsEditor value={splits} onSave={saveSplits} disabled={busy} />
            </div>
            {feeCents > 0 && (
              <div style={{ marginTop: 12 }}>
                <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Pot: {money(feeCents)} × {enrolledCount} in = <strong style={{ color: "var(--brand)" }}>{money(potCents)}</strong></p>
                {payouts.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 4 }}>
                    {payouts.map((p) => <span key={p.place} className={styles.roleBadge}>{ordinal(p.place)}: {money(p.amountCents)}</span>)}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={styles.titleRow}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Games ({games.length})</p>
        <button type="button" className={styles.createBtnGhost} onClick={() => { setError(null); setAddOpen(true); }}>+ Add game</button>
      </div>

      {games.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 10 }}>No games yet. Add your first game.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {games.map((g) => {
            const sp = Math.abs(Number(g.spread ?? 0));
            const row = (side: "away" | "home") => {
              const logo = side === "away" ? g.away_logo_url : g.home_logo_url;
              const name = side === "away" ? g.away_team : g.home_team;
              const spread = g.spread != null && g.favorite ? (g.favorite === side ? `-${sp}` : `+${sp}`) : "";
              return (
                <div className={styles.pickAdminRow}>
                  {logo ? <img src={logo} alt="" className={styles.pickLogo} /> : <span className={styles.pickLogo} />}
                  <span className={styles.pickAdminName}>{name}</span>
                  <span className={styles.pickSpread}>{spread}</span>
                  <input className={styles.pickAdminScore} inputMode="numeric" value={scoreDraft[g.id]?.[side] ?? ""} placeholder="–"
                    onChange={(e) => setScore(g.id, side, e.target.value)} onBlur={() => saveResult(g)} />
                </div>
              );
            };
            return (
              <div key={g.id} className={styles.pickAdminGame} data-tb={g.is_tiebreaker || undefined}>
                {row("away")}
                {row("home")}
                <div className={styles.pickAdminFoot}>
                  <span className={styles.pickCardMeta} style={{ margin: 0 }}>
                    {g.game_time ? new Date(g.game_time).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "No time set"}{g.tv_channel ? ` · ${g.tv_channel}` : ""}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button type="button" className={styles.tbPill} data-on={g.is_tiebreaker || undefined} onClick={() => patchGame(g.id, { is_tiebreaker: !g.is_tiebreaker })} disabled={busy}>Tiebreaker</button>
                  <button type="button" className={styles.iconDelBtn} aria-label="Remove game" onClick={() => setConfirmDel(g.id)} disabled={busy}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6M10 11v6M14 11v6" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={addOpen} title="Add a game" onClose={() => (busy ? undefined : setAddOpen(false))}>
        <form className={styles.form} onSubmit={addGame}>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}><label className={styles.label}>Away</label><TeamCombobox value={away} onChange={setAway} placeholder="Search teams…" /></div>
            <div className={styles.field}><label className={styles.label}>Home</label><TeamCombobox value={home} onChange={setHome} placeholder="Search teams…" /></div>
          </div>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Favorite</label>
              <select className={styles.selectInput} value={favorite} onChange={(e) => setFavorite(e.target.value as "away" | "home")}>
                <option value="home">Home</option>
                <option value="away">Away</option>
              </select>
            </div>
            <div className={styles.field}><label className={styles.label}>Spread</label><input className={styles.input} inputMode="decimal" value={spread} onChange={(e) => setSpread(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="e.g. 7" /></div>
          </div>
          <div className={styles.profileTwoCol}>
            <div className={styles.field}><label className={styles.label}>Start time</label><input type="datetime-local" className={styles.input} value={gameTime} onChange={(e) => setGameTime(e.target.value)} /></div>
            <div className={styles.field}><label className={styles.label}>TV <span className={styles.optional}>(optional)</span></label><input className={styles.input} value={tv} onChange={(e) => setTv(e.target.value)} placeholder="ESPN" /></div>
          </div>
          <label className={styles.profileToggle}><input type="checkbox" checked={isTb} onChange={(e) => setIsTb(e.target.checked)} /><span>Tiebreaker game (guess total points)</span></label>
          {error && <p className={styles.formError}>{error}</p>}
          <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>{busy ? "Saving…" : "Add game"}</button>
        </form>
      </Modal>

      {games.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <button type="button" className={styles.deleteBtn} onClick={() => setConfirmReset(true)} disabled={busy}>Reset picks</button>
        </div>
      )}

      <ConfirmModal open={!!confirmDel} title="Remove this game?" message="This deletes the game and everyone's picks on it." confirmLabel="Remove" destructive onConfirm={() => confirmDel && del(confirmDel)} onCancel={() => setConfirmDel(null)} />
      <ConfirmModal open={confirmReset} title="Reset everyone's picks?" message="This clears every member's picks for this Pick'em. The game slate and results stay." confirmLabel="Reset picks" destructive onConfirm={reset} onCancel={() => setConfirmReset(false)} />
    </div>
  );
}
