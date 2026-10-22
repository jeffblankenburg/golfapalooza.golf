"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import styles from "@/app/new/new.module.css";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import { FBS_TEAMS, getTeamLogoUrl } from "@/lib/data/fbs-teams";
import { computePickemPayouts, type PayoutSplit } from "@/lib/v2/contests/pickem";
import GameSelectModal from "@/components/v2/sports/GameSelectModal";
import type { EspnGame } from "@/lib/v2/sports/espn";
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
  espn_event_id?: string | null;
  locked?: boolean; // a pick has been made → line is frozen
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

// Scope-agnostic: the mount supplies `base` (API root for this contest) and
// `adminBase` (admin URL root). Event mounts pass the event-nested paths; a
// group mount passes the group paths. The component itself is identical.
export default function PickemAdmin({ base, playersHref, showMoney = true, initialStatus, initialFeeCents, initialSplits, enrolledCount }: {
  base: string;
  // Enrollment page link. Event scope has a roster/players page; group scope
  // (opt-in) has none, so it's omitted and the Players block is hidden.
  playersHref?: string | null;
  // Event scope funds Pick'em via an Option (entry fee + pot payouts). Group scope
  // has no Options model (money deferred / settle-up), so hide that whole section.
  showMoney?: boolean;
  initialStatus: string;
  initialFeeCents: number; initialSplits: PayoutSplit[]; enrolledCount: number;
}) {
  const [games, setGames] = useState<Game[]>([]);
  const [status, setStatus] = useState(initialStatus);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [picks, setPicks] = useState<EspnGame[]>([]);
  const [gamesOpen, setGamesOpen] = useState(true);
  const [helpOpen, setHelpOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [moneyOpen, setMoneyOpen] = useState(false);
  const [lineEdit, setLineEdit] = useState<Game | null>(null); // game being edited in the modal
  const [eFav, setEFav] = useState<"" | "away" | "home">("");
  const [eSpread, setESpread] = useState("");
  const [eAwayScore, setEAwayScore] = useState("");
  const [eHomeScore, setEHomeScore] = useState("");

  // Money: entry fee (the contest buy-in members pay via an Option) + payout splits.
  const [fee, setFee] = useState(initialFeeCents ? String(initialFeeCents / 100) : "");
  const [splits, setSplits] = useState<PayoutSplit[]>(initialSplits || []);
  const feeCents = Math.round((Number(fee) || 0) * 100);
  const potCents = feeCents * enrolledCount;
  const payouts = computePickemPayouts(potCents, splits);
  // Any pick anywhere in the contest freezes the tiebreaker choice.
  const anyPicks = games.some((g) => g.locked);

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

  function openPicker() {
    setError(null);
    setPicks([]);
    setPickerOpen(true);
  }
  // Pull the picked games (teams, kickoff, TV, and the line) straight from ESPN.
  // Dedup is server-side, so re-picking an existing game is a no-op.
  async function addPicks() {
    setPickerOpen(false);
    if (picks.length === 0) return;
    setBusy(true); setError(null);
    try {
      const res = await fetch(`${base}/pickem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ espnGames: picks }),
      });
      if (!res.ok) { setError("Could not add games"); return; }
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

      {playersHref && (
        <Link href={playersHref} className={styles.cscAcc} style={{ display: "block", marginBottom: 16, textDecoration: "none" }}>
          <div className={styles.cscAccHead}>
            <span className={styles.cscAllMain}>
              <span className={styles.cscAllName}>Players</span>
              <span className={styles.cscAllPlayers}>{enrolledCount} enrolled, add on-site opt-ins or remove</span>
            </span>
            <svg className={styles.cscAccChevron} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 5l7 7-7 7" /></svg>
          </div>
        </Link>
      )}

      {showMoney && (
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
      )}

      <div className={styles.cscAcc} data-open={gamesOpen || undefined} style={{ marginBottom: 16 }}>
        <button type="button" className={styles.cscAccHead} onClick={() => setGamesOpen((v) => !v)} aria-expanded={gamesOpen}>
          <span className={styles.cscAllMain}>
            <span className={styles.cscAllName}>Games</span>
            <span className={styles.cscAllPlayers}>{games.length} game{games.length === 1 ? "" : "s"}</span>
          </span>
          <svg className={styles.cscAccChevron} data-open={gamesOpen || undefined} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" /></svg>
        </button>
        {gamesOpen && (
          <div className={styles.cscAccBody} style={{ paddingTop: 14 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 8 }}>
              <button type="button" className={styles.createBtnGhost} style={{ flex: 1 }} onClick={openPicker}>+ Add games</button>
              <button type="button" onClick={() => setHelpOpen((v) => !v)} aria-label="How this works" title="How this works"
                style={{ flex: "none", width: 30, height: 30, borderRadius: "50%", border: "1px solid var(--line-strong)", background: "var(--card)", color: "var(--ink-soft)", fontWeight: 800, cursor: "pointer" }}>?</button>
              {helpOpen && (
                <>
                  <div onClick={() => setHelpOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 11, background: "var(--surface, #fff)", border: "1px solid var(--line)", borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", padding: 14, fontSize: "0.85rem", lineHeight: 1.45, color: "var(--ink)" }}>
                    <p style={{ margin: "0 0 10px" }}><span style={{ color: "#e0a000", fontWeight: 800 }}>★</span> marks the tiebreaker game (its total-points guess breaks ties).</p>
                    <p style={{ margin: "0 0 10px" }}><strong>Update (↻)</strong> pulls the current line from ESPN. If the game has no line yet it fills one in; a line you already have is never erased.</p>
                    <p style={{ margin: "0 0 10px" }}><strong>Update</strong> after a game finishes pulls the final score — though that also happens automatically.</p>
                    <p style={{ margin: 0 }}>Once anyone picks a game, its <strong>line locks</strong> — refresh and manual edits can&apos;t change it (scores still update), so it can&apos;t move out from under existing picks.</p>
                    <p style={{ margin: "10px 0 0", borderTop: "1px solid var(--line)", paddingTop: 10, color: "var(--ink-soft)" }}>
                      Game not on ESPN? <button type="button" onClick={() => { setHelpOpen(false); setError(null); setAddOpen(true); }} style={{ background: "none", border: "none", padding: 0, color: "var(--brand, #0a5c36)", font: "inherit", textDecoration: "underline", cursor: "pointer" }}>Add it manually</button>.
                    </p>
                  </div>
                </>
              )}
            </div>

            {games.length === 0 ? (
              <p className={styles.dnsHint} style={{ marginTop: 10 }}>No games yet. Add your first game.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
          {games.map((g) => {
            const sp = Math.abs(Number(g.spread ?? 0));
            // Which side COVERED once final (ATS; straight-up when no line). null = push/ungraded.
            const graded = g.away_score != null && g.home_score != null;
            const covering: "away" | "home" | null = (() => {
              if (!graded) return null;
              const margin = (g.home_score as number) - (g.away_score as number);
              const homeSpread = g.favorite === "home" ? -sp : sp;
              const adj = margin + homeSpread;
              return adj === 0 ? null : adj > 0 ? "home" : "away";
            })();
            const row = (side: "away" | "home") => {
              const logo = side === "away" ? g.away_logo_url : g.home_logo_url;
              const name = side === "away" ? g.away_team : g.home_team;
              const spread = g.spread != null && g.favorite ? (g.favorite === side ? `-${sp}` : `+${sp}`) : "";
              const score = side === "away" ? g.away_score : g.home_score;
              return (
                <div className={styles.pickAdminRow} data-win={covering === side || undefined}>
                  {logo ? <img src={logo} alt="" className={styles.pickLogo} /> : <span className={styles.pickLogo} />}
                  <span className={styles.pickNameWrap}>
                    <span className={styles.pickAdminName}>{name}</span>
                    {spread && <span className={styles.pickSpread}>{spread}</span>}
                  </span>
                  <span className={styles.pickScoreVal}>{score != null ? score : ""}</span>
                </div>
              );
            };
            return (
              <div key={g.id} className={styles.pickAdminGame} data-tb={g.is_tiebreaker || undefined}>
                {g.is_tiebreaker && <div className={styles.tbHeader}>Tiebreaker</div>}
                {row("away")}
                {row("home")}
                <div className={styles.pickAdminFoot}>
                  <span className={styles.pickCardMeta} style={{ margin: 0 }}>
                    {g.game_time ? new Date(g.game_time).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }) : "No time set"}{g.tv_channel ? `, ${g.tv_channel}` : ""}
                  </span>
                  <span style={{ flex: 1 }} />
                  <button type="button" className={styles.pickIconBtn} data-on={g.is_tiebreaker || undefined} onClick={() => patchGame(g.id, { is_tiebreaker: !g.is_tiebreaker })} disabled={busy || anyPicks} title={anyPicks ? "Tiebreaker is locked — picks have been made" : g.is_tiebreaker ? "Tiebreaker game" : "Mark as tiebreaker"} aria-label="Toggle tiebreaker game">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  </button>
                  {g.espn_event_id && (
                    <button type="button" className={styles.pickIconBtn} onClick={() => patchGame(g.id, { refreshLine: true })} disabled={busy} aria-label="Update line & score from ESPN" title="Update line & score from ESPN">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 12a9 9 0 0 1 15-6.7L21 8" /><path d="M21 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6.7L3 16" /><path d="M3 21v-5h5" /></svg>
                    </button>
                  )}
                  <button type="button" className={styles.pickIconBtn} onClick={() => { setLineEdit(g); setEFav(g.favorite ?? ""); setESpread(g.spread != null ? String(g.spread) : ""); setEAwayScore(g.away_score != null ? String(g.away_score) : ""); setEHomeScore(g.home_score != null ? String(g.home_score) : ""); }} disabled={busy} aria-label="Edit game" title="Edit game">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
                  </button>
                  <button type="button" className={styles.pickIconBtn} data-danger onClick={() => setConfirmDel(g.id)} disabled={busy} aria-label="Remove game" title="Remove game">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m2 0v14a1 1 0 01-1 1H7a1 1 0 01-1-1V6M10 11v6M14 11v6" /></svg>
                  </button>
                </div>
              </div>
            );
          })}
              </div>
            )}
          </div>
        )}
      </div>

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

      {pickerOpen && (
        <GameSelectModal value={picks} onChange={setPicks} onClose={addPicks} initialLeague="college-football" />
      )}

      <Modal open={!!lineEdit} title="Edit game" onClose={() => setLineEdit(null)}>
        {lineEdit && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {lineEdit.locked && (
              <p className={styles.dnsHint} style={{ margin: 0 }}>Picks have been made on this game, so its line is locked. You can still enter the final score.</p>
            )}
            <div className={styles.field}>
              <label className={styles.label}>Favorite</label>
              <select className={styles.selectInput} value={eFav} disabled={lineEdit.locked} onChange={(e) => setEFav(e.target.value as "" | "away" | "home")}>
                <option value="">Pick&apos;em (no line)</option>
                <option value="away">{lineEdit.away_team} favored</option>
                <option value="home">{lineEdit.home_team} favored</option>
              </select>
            </div>
            {eFav && (
              <div className={styles.field}>
                <label className={styles.label}>Spread</label>
                <input className={styles.input} inputMode="decimal" value={eSpread} disabled={lineEdit.locked} placeholder="e.g. 3.5" onChange={(e) => setESpread(e.target.value.replace(/[^0-9.]/g, ""))} />
              </div>
            )}
            <div className={styles.field} style={{ marginBottom: 0 }}>
              <label className={styles.label}>Final score <span className={styles.optional}>(manual override — ESPN fills this automatically)</span></label>
              <div className={styles.profileTwoCol}>
                <input className={styles.input} inputMode="numeric" value={eAwayScore} placeholder={lineEdit.away_team} onChange={(e) => setEAwayScore(e.target.value.replace(/[^0-9]/g, ""))} />
                <input className={styles.input} inputMode="numeric" value={eHomeScore} placeholder={lineEdit.home_team} onChange={(e) => setEHomeScore(e.target.value.replace(/[^0-9]/g, ""))} />
              </div>
            </div>
            <button
              type="button"
              className={styles.createBtn}
              disabled={busy}
              onClick={async () => {
                // Locked games: send only the score (the line can't change).
                const patch: Record<string, unknown> = lineEdit.locked
                  ? {}
                  : eFav ? { favorite: eFav, spread: Number(eSpread) || 0 } : { favorite: null, spread: null };
                const a = eAwayScore.trim() === "" ? null : Math.max(0, Math.round(Number(eAwayScore)));
                const h = eHomeScore.trim() === "" ? null : Math.max(0, Math.round(Number(eHomeScore)));
                patch.away_score = a;
                patch.home_score = h;
                patch.winning_team = a != null && h != null ? (a === h ? null : a > h ? "away" : "home") : null;
                await patchGame(lineEdit.id, patch);
                setLineEdit(null);
              }}
            >
              Save
            </button>
          </div>
        )}
      </Modal>

      {games.length > 0 && (
        <div style={{ marginTop: 20, marginBottom: 24 }}>
          <button type="button" className={styles.deleteBtn} onClick={() => setConfirmReset(true)} disabled={busy}>Reset picks</button>
        </div>
      )}

      <ConfirmModal open={!!confirmDel} title="Remove this game?" message="This deletes the game and everyone's picks on it." confirmLabel="Remove" destructive onConfirm={() => confirmDel && del(confirmDel)} onCancel={() => setConfirmDel(null)} />
      <ConfirmModal open={confirmReset} title="Reset everyone's picks?" message="This clears every member's picks for this Pick'em. The game slate and results stay." confirmLabel="Reset picks" destructive onConfirm={reset} onCancel={() => setConfirmReset(false)} />
    </div>
  );
}
