"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import styles from "./SquaresAdmin.module.css";
import { resolvePayouts } from "@/lib/v2/contests/squares";
import { buildGameAllocations } from "@/lib/v2/contests/squares-alloc";
import SquaresEditor, { money, dateLabel, isoToLocal, localToISO, type SquaresContestRow } from "./SquaresEditor";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { computePickemPayouts, type PayoutSplit } from "@/lib/v2/contests/pickem";
import PayoutSplitsEditor, { ordinal } from "../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";

// One unified list for the group Contests hub — every created pool, any type,
// in one place (no per-type sections), with a single "Add contest" control.
export interface PickemGamePreview {
  awayTeam: string;
  homeTeam: string;
  awayAbbrev: string | null;
  homeAbbrev: string | null;
  spread: number | null;
  favorite: "away" | "home" | null;
  gameTime: string | null;
  isTiebreaker: boolean;
  scored: boolean;                        // both scores in → completed
  winner: "away" | "home" | null;         // ATS covering side (null = push / unscored)
  pctCorrect: number | null;              // % of pickers who covered, once scored
  majoritySide: "away" | "home" | null;   // the crowd's pick before the game is scored
  majorityPct: number | null;             // % of pickers on the majority side
}

/** Short team label for the compact admin preview: ESPN abbreviation, else full name. */
function teamShort(g: PickemGamePreview, side: "away" | "home"): string {
  const abbrev = side === "away" ? g.awayAbbrev : g.homeAbbrev;
  const full = side === "away" ? g.awayTeam : g.homeTeam;
  return (abbrev || "").trim() || full;
}
export type GroupContestItem =
  | { kind: "squares"; id: string; createdAt: string; box: SquaresContestRow }
  | {
      kind: "pickem";
      id: string;
      createdAt: string;
      name: string;
      status: string;
      entryCents: number;
      collectedBy: string | null;
      payoutSplits: PayoutSplit[];
      participantCount: number;
      games: PickemGamePreview[];
    };

// Contest types an admin can create at the group level today.
const ADDABLE = [
  { key: "squares", label: "Squares pool", blurb: "Squares grid for any games" },
  { key: "pickem", label: "Pick'em", blurb: "Pick games vs. the spread" },
] as const;

type PickemItem = Extract<GroupContestItem, { kind: "pickem" }>;

const statusLabel = (s: string) => (s === "active" ? "Open" : s === "draft" ? "Draft" : s);
const centsToStr = (c: number) => (c ? String(c / 100) : "");
function fmtMoney(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}
function gameWhen(iso: string | null): string {
  if (!iso) return "TBD";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
/** Team label with the line inline — the favorite carries "-spread". */
function teamWithLine(g: PickemGamePreview, side: "away" | "home"): string {
  const label = teamShort(g, side);
  if (g.isTiebreaker || g.spread == null || !g.favorite || g.favorite !== side) return label;
  return `${label} -${g.spread}`;
}

/** The glyph for a contest type — shared by the list badge and the add menu. */
function ContestTypeIcon({ kind, size = 13 }: { kind: "squares" | "pickem"; size?: number }) {
  return kind === "squares" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" fill="currentColor" stroke="currentColor" strokeWidth={2} />
      <path d="M8 12l2.5 2.5L16 9" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Contest-type badge — glyph + label, matching the home-page type tags. */
function ContestTypeTag({ kind }: { kind: "squares" | "pickem" }) {
  return (
    <span className={styles.typeTag}>
      <ContestTypeIcon kind={kind} />
      {kind === "squares" ? "Squares" : "Pick'em"}
    </span>
  );
}

export default function GroupContestsAdmin({ orgId, slug, items, currentUserId, nameMode }: { orgId: string; slug: string; items: GroupContestItem[]; currentUserId: string; nameMode: NameMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionBase = `/api/v2/orgs/${orgId}/contests`;
  const adminBase = `/new/${slug}/admin/contests`;

  const [menuOpen, setMenuOpen] = useState(false);
  // undefined = Squares editor closed; null = creating; a row = editing that pool.
  const [editing, setEditing] = useState<SquaresContestRow | null | undefined>(undefined);
  const [pickemOpen, setPickemOpen] = useState(false);
  const [pickemName, setPickemName] = useState("");
  const [settingsFor, setSettingsFor] = useState<PickemItem | null>(null);
  const [squaresSettingsFor, setSquaresSettingsFor] = useState<SquaresContestRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Open the Squares quick-settings when linked with ?settings=<id>.
  useEffect(() => {
    const id = searchParams.get("settings");
    if (!id) return;
    const it = items.find((x) => x.kind === "squares" && x.id === id);
    if (it && it.kind === "squares") setSquaresSettingsFor(it.box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function pick(kind: string) {
    setMenuOpen(false);
    if (kind === "squares") setEditing(null);
    else if (kind === "pickem") { setPickemName(""); setErr(null); setPickemOpen(true); }
  }

  async function createPickem() {
    const n = pickemName.trim();
    if (!n || saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(collectionBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_type: "pickem", name: n }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Could not create."); setSaving(false); return; }
      router.push(`${adminBase}/${d.id}`);
    } catch {
      setErr("Something went wrong.");
      setSaving(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.head}>
        <h1 className={styles.title}>Contests</h1>
        <p className={styles.sub}>Group-wide pools, open to every member — separate from your event contests.</p>
      </div>

      <div style={{ position: "relative" }}>
        <button type="button" className={styles.add} onClick={() => setMenuOpen((o) => !o)}>+ Add contest</button>
        {menuOpen && (
          <>
            <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 10 }} />
            <div
              style={{
                position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 11,
                background: "var(--surface, #fff)", border: "1px solid var(--line, #e5e7eb)",
                borderRadius: 12, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", overflow: "hidden",
              }}
            >
              {ADDABLE.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => pick(t.key)}
                  style={{
                    display: "flex", alignItems: "flex-start", gap: 10, width: "100%", textAlign: "left", padding: "12px 14px",
                    background: "none", border: "none", borderBottom: "1px solid var(--line, #f1f1f1)", cursor: "pointer",
                  }}
                >
                  <span style={{ color: "var(--brand, #0a5c36)", display: "inline-flex", paddingTop: 2 }}>
                    <ContestTypeIcon kind={t.key} size={18} />
                  </span>
                  <span>
                    <span style={{ display: "block", fontWeight: 600 }}>{t.label}</span>
                    <span style={{ display: "block", fontSize: "0.8125rem", color: "var(--ink-soft, #6b7280)" }}>{t.blurb}</span>
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {editing === null && (
        <SquaresEditor collectionBase={collectionBase} editing={null} nameMode={nameMode} currentUserId={currentUserId} onClose={() => setEditing(undefined)} />
      )}

      <Modal open={pickemOpen} title="New Pick'em" onClose={() => setPickemOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className={styles.input}
            style={{ width: "100%" }}
            value={pickemName}
            autoFocus
            onChange={(e) => setPickemName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createPickem(); }}
            placeholder="e.g. Bowl Week Pick'em"
          />
          {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
          <button type="button" className={styles.create} onClick={() => void createPickem()} disabled={saving || !pickemName.trim()}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </Modal>

      <div className={styles.list}>
        {items.length === 0 && editing === undefined && <p className={styles.empty}>No contests yet. Add one above.</p>}
        {items.map((it) =>
          it.kind === "squares" ? (
            <SquaresRow key={it.id} c={it.box} adminBase={adminBase} isOpen={expanded.has(it.id)} onToggle={() => toggleRow(it.id)} onEdit={() => setSquaresSettingsFor(it.box)} />
          ) : (
            <PickemRow key={it.id} it={it} adminBase={adminBase} isOpen={expanded.has(it.id)} onToggle={() => toggleRow(it.id)} onSettings={() => setSettingsFor(it)} />
          ),
        )}
      </div>

      {settingsFor && (
        <PickemQuickSettings
          orgId={orgId}
          item={settingsFor}
          currentUserId={currentUserId}
          nameMode={nameMode}
          onClose={() => setSettingsFor(null)}
          onSaved={() => { setSettingsFor(null); router.refresh(); }}
        />
      )}

      {squaresSettingsFor && (
        <SquaresQuickSettings
          orgId={orgId}
          box={squaresSettingsFor}
          currentUserId={currentUserId}
          nameMode={nameMode}
          onClose={() => { setSquaresSettingsFor(null); router.refresh(); }}
          onSaved={() => { setSquaresSettingsFor(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

/** One Pick'em in the list — mirrors SquaresRow: expandable (matchups preview) with
 *  a gear (quick settings) + an arrow to the full manage page. */
function PickemRow({ it, adminBase, isOpen, onToggle, onSettings }: { it: PickemItem; adminBase: string; isOpen: boolean; onToggle: () => void; onSettings: () => void }) {
  const pot = it.entryCents * it.participantCount;
  const realGames = it.games.filter((g) => !g.isTiebreaker);
  const meta = [
    it.entryCents > 0 ? `${fmtMoney(it.entryCents)} buy-in` : "no buy-in",
    it.entryCents > 0 && it.participantCount > 0 ? `${fmtMoney(pot)} pot` : null,
    statusLabel(it.status),
  ].filter(Boolean).join(", ");
  return (
    <div className={styles.rowWrap} data-open={isOpen || undefined}>
      <div className={styles.rowHead}>
        <button type="button" className={styles.rowMain} onClick={onToggle} aria-expanded={isOpen}>
          <span className={styles.rowHeadText}>
            <ContestTypeTag kind="pickem" />
            <span className={styles.rowName}>{it.name}</span>
            <span className={styles.rowMeta}>{meta}</span>
            <span className={styles.rowCount}>{realGames.length} game{realGames.length === 1 ? "" : "s"}</span>
          </span>
          <svg className={styles.rowChev} data-open={isOpen || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div className={styles.rowActions}>
          <button type="button" onClick={onSettings} aria-label="Quick settings" title="Quick settings">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <Link href={`${adminBase}/${it.id}`} aria-label="Open Pick'em details" title="Open Pick'em details">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
          </Link>
        </div>
      </div>
      {isOpen && (
        <div className={styles.rowBody}>
          {realGames.length === 0 ? (
            <p className={styles.rowEmpty}>No games yet. Open the Pick&apos;em to build the slate.</p>
          ) : (
            <table className={styles.gameTable}>
              <tbody>
                {realGames.map((g, i) => (
                  <tr key={i}>
                    <td className={styles.gtWhen}>{gameWhen(g.gameTime)}</td>
                    <td className={styles.gtGame}>
                      <span style={{ fontWeight: g.scored && g.winner === "away" ? 800 : undefined }}>{teamWithLine(g, "away")}</span>
                      {" @ "}
                      <span style={{ fontWeight: g.scored && g.winner === "home" ? 800 : undefined }}>{teamWithLine(g, "home")}</span>
                    </td>
                    <td className={styles.gtPay}>{g.scored ? (g.pctCorrect != null ? `${g.pctCorrect}%` : "Final") : (g.majoritySide ? `${teamShort(g, g.majoritySide)} ${g.majorityPct}%` : "")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

/** Quick settings for a Pick'em (name / status / buy-in / collector) — the parity
 *  with Squares' gear-editor. Deep management (games, payouts) stays on detail. */
function PickemQuickSettings({ orgId, item, currentUserId, nameMode, onClose, onSaved }: { orgId: string; item: PickemItem; currentUserId: string; nameMode: NameMode; onClose: () => void; onSaved: () => void }) {
  const base = `/api/v2/orgs/${orgId}/contests/${item.id}`;
  const [name, setName] = useState(item.name);
  const [status, setStatus] = useState(item.status);
  const [fee, setFee] = useState(centsToStr(item.entryCents));
  const [collectedBy, setCollectedBy] = useState(item.collectedBy || currentUserId);
  const [splits, setSplits] = useState<PayoutSplit[]>(item.payoutSplits || []);
  const [members, setMembers] = useState<{ user_id: string; name: string; venmo: string | null }[]>([]);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const feeCents = Math.round((Number(fee) || 0) * 100);
  const pot = feeCents * item.participantCount;
  const payouts = computePickemPayouts(pot, splits);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/v2/orgs/${orgId}/members`);
      if (r.ok) {
        const list = ((await r.json()).members || []) as { user_id: string; display_name: string; first_name: string | null; last_name: string | null; venmo_username: string | null; archived?: boolean }[];
        setMembers(list.filter((m) => !m.archived).map((m) => ({ user_id: m.user_id, name: pickName(m, nameMode), venmo: m.venmo_username })).sort((a, b) => a.name.localeCompare(b.name)));
      }
    })();
  }, [orgId]);

  async function save() {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true);
    setErr(null);
    const res = await fetch(base, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: n, status, entry_cents: feeCents, collected_by: collectedBy || null, payout_splits: splits }),
    });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); setSaving(false); return; }
    onSaved();
  }

  return (
    <Modal open title="Pick'em settings" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Name</span>
          <input className={styles.input} style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label>
          <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Status</span>
          <select className={styles.selectInput} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="draft">Draft (hidden from members)</option>
            <option value="active">Open (members can pick)</option>
            <option value="final">Final (closed)</option>
          </select>
        </label>
        <label>
          <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Buy-in</span>
          <span style={{ position: "relative", display: "block" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft)", pointerEvents: "none" }}>$</span>
            <input className={styles.input} style={{ paddingLeft: 26 }} inputMode="decimal" value={fee} placeholder="0" onChange={(e) => setFee(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
        </label>
        <label>
          <span style={{ display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 }}>Who&apos;s collecting? (needs Venmo)</span>
          <select className={styles.selectInput} value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)}>
            {members.map((m) => <option key={m.user_id} value={m.user_id} disabled={!m.venmo && m.user_id !== collectedBy}>{m.name}{m.venmo ? "" : " (needs Venmo)"}</option>)}
          </select>
        </label>
        <div>
          <span style={QS_LABEL}>Payout splits <span style={{ fontWeight: 400, color: "var(--ink-soft)" }}>(how the pot is divided by place)</span></span>
          <PayoutSplitsEditor value={splits} onSave={setSplits} />
          {feeCents > 0 && item.participantCount > 0 && (
            <p style={{ margin: "6px 0 0", fontSize: "0.78rem", color: "var(--ink-soft)" }}>
              Pot: {money(feeCents)} × {item.participantCount} in = <strong style={{ color: "var(--brand)" }}>{money(pot)}</strong>
            </p>
          )}
          {feeCents > 0 && payouts.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {payouts.map((p) => (
                <span key={p.place} style={{ fontSize: "0.75rem", fontWeight: 700, padding: "3px 8px", borderRadius: 999, background: "var(--brand-tint, #e8f2ec)", color: "var(--brand, #0a5c36)" }}>
                  {ordinal(p.place)}: {money(p.amountCents)}
                </span>
              ))}
            </div>
          )}
        </div>
        {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
        <button type="button" className={styles.create} onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

const QS_LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

/** Quick settings for a Squares pool (name / buy-in / visibility / collector / draft
 *  rules) — parity with Pick'em's gear. Games & payouts live on the detail page. */
function SquaresQuickSettings({ orgId, box, currentUserId, nameMode, onClose, onSaved }: { orgId: string; box: SquaresContestRow; currentUserId: string; nameMode: NameMode; onClose: () => void; onSaved: () => void }) {
  const base = `/api/v2/orgs/${orgId}/contests/${box.id}`;
  const [name, setName] = useState(box.name);
  const [costStr, setCostStr] = useState(box.cellCostCents ? String(box.cellCostCents / 100) : "");
  const [collectedBy, setCollectedBy] = useState(box.collectedBy || currentUserId);
  const [members, setMembers] = useState<{ user_id: string; name: string; venmo: string | null }[]>([]);
  const [maxPrimary, setMaxPrimary] = useState(String(box.maxSquaresPrimary));
  const [secUnlimited, setSecUnlimited] = useState(box.maxSquaresSecondary == null);
  const [maxSecondary, setMaxSecondary] = useState(String(box.maxSquaresSecondary ?? 20));
  const [primaryEnds, setPrimaryEnds] = useState(isoToLocal(box.primaryEndsAt));
  const [secondaryEnds, setSecondaryEnds] = useState(isoToLocal(box.secondaryEndsAt));
  const [visible, setVisible] = useState(box.status === "active");
  const [phase, setPhase] = useState(box.phase);
  const [togglingVis, setTogglingVis] = useState(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const r = await fetch(`/api/v2/orgs/${orgId}/members`);
      if (r.ok) {
        const list = ((await r.json()).members || []) as { user_id: string; display_name: string; first_name: string | null; last_name: string | null; venmo_username: string | null; archived?: boolean }[];
        setMembers(list.filter((m) => !m.archived).map((m) => ({ user_id: m.user_id, name: pickName(m, nameMode), venmo: m.venmo_username })).sort((a, b) => a.name.localeCompare(b.name)));
      }
    })();
  }, [orgId]);

  // The simple gear toggle only owns the first open/close; once buying has moved
  // past primary the detail-page lifecycle governs visibility.
  const canToggleVisibility = phase === "setup" || phase === "primary";

  async function toggleVisible() {
    if (togglingVis || !canToggleVisibility) return;
    const next = !visible;
    setTogglingVis(true); setErr(null); setVisible(next);
    const res = await fetch(`${base}/squares/action`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: next ? "open_primary" : "back_to_setup" }),
    });
    if (res.ok) { const d = await res.json().catch(() => ({})); setPhase(d.phase ?? (next ? "primary" : "setup")); }
    else { setVisible(!next); setErr((await res.json().catch(() => ({}))).error || "Could not change visibility"); }
    setTogglingVis(false);
  }

  async function save() {
    const n = name.trim();
    if (!n || saving) return;
    setSaving(true); setErr(null);
    const res = await fetch(base, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: n,
        cell_cost_cents: Math.round((Number(costStr) || 0) * 100),
        collected_by: collectedBy || null,
        max_squares_primary: Math.max(1, parseInt(maxPrimary, 10) || 1),
        max_squares_secondary: secUnlimited ? null : Math.max(1, parseInt(maxSecondary, 10) || 1),
        primary_ends_at: localToISO(primaryEnds),
        secondary_ends_at: localToISO(secondaryEnds),
      }),
    });
    if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not save"); setSaving(false); return; }
    onSaved();
  }

  return (
    <Modal open title="Squares settings" onClose={onClose}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          <span style={QS_LABEL}>Name</span>
          <input className={styles.input} style={{ width: "100%" }} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
        </label>
        <label>
          <span style={QS_LABEL}>Buy-in (per square)</span>
          <span style={{ position: "relative", display: "block" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft, #59635b)", pointerEvents: "none" }}>$</span>
            <input className={styles.input} style={{ width: "100%", paddingLeft: 26 }} inputMode="decimal" value={costStr} placeholder="0" onChange={(e) => setCostStr(e.target.value.replace(/[^0-9.]/g, ""))} />
          </span>
        </label>
        <label>
          <span style={QS_LABEL}>Who&apos;s collecting? (needs Venmo)</span>
          <select className={styles.selectInput} value={collectedBy} onChange={(e) => setCollectedBy(e.target.value)}>
            {members.map((m) => <option key={m.user_id} value={m.user_id} disabled={!m.venmo && m.user_id !== collectedBy}>{m.name}{m.venmo ? "" : " (needs Venmo)"}</option>)}
          </select>
        </label>
        <div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: canToggleVisibility ? "pointer" : "default", opacity: canToggleVisibility ? 1 : 0.6 }}>
            <input type="checkbox" checked={visible} disabled={!canToggleVisibility || togglingVis} onChange={toggleVisible} />
            <span>Visible to members {visible ? "(open for buying)" : "(draft, hidden)"}</span>
          </label>
          {!canToggleVisibility && <p className={styles.capHint} style={{ marginTop: 4 }}>Buying is underway — manage visibility on the pool page.</p>}
        </div>
        <div>
          <span style={QS_LABEL}>Squares per person</span>
          <div className={styles.caps}>
            <label className={styles.capField}>
              <span className={styles.capName}>Primary draft</span>
              <input className={styles.capInput} value={maxPrimary} inputMode="numeric" onChange={(e) => setMaxPrimary(e.target.value.replace(/\D/g, ""))} />
            </label>
            <div className={styles.capField}>
              <span className={styles.capName}>Secondary draft</span>
              <div className={styles.capRow}>
                <div className={styles.seg} role="group" aria-label="Secondary cap">
                  <button type="button" data-on={secUnlimited || undefined} onClick={() => setSecUnlimited(true)}>Unlimited</button>
                  <button type="button" data-on={!secUnlimited || undefined} onClick={() => setSecUnlimited(false)}>Limit</button>
                </div>
                {!secUnlimited && <input className={styles.capInput} value={maxSecondary} inputMode="numeric" onChange={(e) => setMaxSecondary(e.target.value.replace(/\D/g, ""))} />}
              </div>
            </div>
          </div>
        </div>
        <label>
          <span style={QS_LABEL}>Primary draft ends</span>
          <input className={styles.input} style={{ width: "100%" }} type="datetime-local" value={primaryEnds} onChange={(e) => setPrimaryEnds(e.target.value)} />
        </label>
        <label>
          <span style={QS_LABEL}>Secondary draft ends (optional)</span>
          <input className={styles.input} style={{ width: "100%" }} type="datetime-local" value={secondaryEnds} onChange={(e) => setSecondaryEnds(e.target.value)} />
        </label>
        {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
        <button type="button" className={styles.create} onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

/** One Squares pool in the list — expandable (game table) with a gear to edit. */
function SquaresRow({ c, adminBase, isOpen, onToggle, onEdit }: { c: SquaresContestRow; adminBase: string; isOpen: boolean; onToggle: () => void; onEdit: () => void }) {
  const cPot = c.cellCostCents * 100;
  const cAlloc = buildGameAllocations(
    c.games.map((g) => ({ id: g.espnEventId, league: g.league, game_alloc: g.gameAlloc, period_alloc: g.periodAlloc })),
    cPot,
    { potAllocation: c.potAllocation, periodWeights: c.periodWeights },
  );
  const centsByGame = new Map(resolvePayouts(cPot, cAlloc).games.map((rg) => [rg.key, rg.cents]));
  const restId = c.games.find((g) => g.gameAlloc?.kind === "remainder")?.espnEventId;
  const orderedGames = [...c.games].sort((a, b) => {
    if (!a.startTime) return 1;
    if (!b.startTime) return -1;
    return a.startTime.localeCompare(b.startTime);
  });
  return (
    <div className={styles.rowWrap} data-open={isOpen || undefined}>
      <div className={styles.rowHead}>
        <button type="button" className={styles.rowMain} onClick={onToggle} aria-expanded={isOpen}>
          <span className={styles.rowHeadText}>
            <ContestTypeTag kind="squares" />
            <span className={styles.rowName}>{c.name}</span>
            <span className={styles.rowMeta}>{money(c.cellCostCents)}/square, {money(cPot)} pot, {c.status}</span>
            <span className={styles.rowCount}>{c.games.length} game{c.games.length === 1 ? "" : "s"}</span>
          </span>
          <svg className={styles.rowChev} data-open={isOpen || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
        </button>
        <div className={styles.rowActions}>
          <button type="button" onClick={onEdit} aria-label="Edit settings" title="Edit settings">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
          </button>
          <Link href={`${adminBase}/${c.id}`} aria-label="Open pool details" title="Open pool details">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 5l7 7-7 7" />
            </svg>
          </Link>
        </div>
      </div>
      {isOpen && (
        <div className={styles.rowBody}>
          {orderedGames.length === 0 ? (
            <p className={styles.rowEmpty}>No games yet. Tap the gear to add some.</p>
          ) : (
            <table className={styles.gameTable}>
              <tbody>
                {orderedGames.map((g) => (
                  <tr key={g.espnEventId}>
                    <td className={styles.gtWhen}>{g.startTime ? dateLabel(g.startTime) : "TBD"}</td>
                    <td className={styles.gtGame}>{g.label || "Game"}</td>
                    <td className={styles.gtPay}>
                      {money(centsByGame.get(g.espnEventId) ?? 0)}
                      {g.espnEventId === restId && <span className={styles.rowRest}>rest</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
