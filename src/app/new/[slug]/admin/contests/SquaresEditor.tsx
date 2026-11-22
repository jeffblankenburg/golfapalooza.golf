"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./SquaresAdmin.module.css";
import GameSelectModal from "@/components/v2/sports/GameSelectModal";
import { parseStake, formatStake } from "@/lib/v2/rounds/stake";
import { getLeague, type EspnGame } from "@/lib/v2/sports/espn";
import { PERIOD_PRESETS, resolvePayouts, validateSquaresTimeline, type Alloc, type GameAllocation } from "@/lib/v2/contests/squares";
import ContestCollector from "@/components/v2/contests/ContestCollector";
import { type NameMode } from "@/lib/v2/profile";
import { formatInstant } from "@/lib/v2/timezone";
import ZonedDateTimeField from "@/app/new/_components/ZonedDateTimeField";

export type Structure = "quarters" | "halves";
const defaultWeights = (s: Structure): Record<string, number> =>
  Object.fromEntries(PERIOD_PRESETS[s].map((p) => [p.key, p.weightPct]));

// Reveal-lead editing: store minutes, but let the admin enter minutes/hours/days.
const LEAD_UNITS = { minutes: 1, hours: 60, days: 1440 } as const;
type LeadUnit = keyof typeof LEAD_UNITS;
const DEFAULT_LEAD_MINUTES = 10080; // 7 days
function decomposeLead(mins: number): { value: string; unit: LeadUnit } {
  const m = Number.isFinite(mins) && mins > 0 ? mins : DEFAULT_LEAD_MINUTES;
  if (m % 1440 === 0) return { value: String(m / 1440), unit: "days" };
  if (m % 60 === 0) return { value: String(m / 60), unit: "hours" };
  return { value: String(m), unit: "minutes" };
}

// Editor allocation — like the engine's Alloc, but `amount` is held in DOLLARS for
// the input (converted to cents at the storage/engine boundary).
export type EditorAlloc = { kind: "amount" | "percent" | "remainder"; value: number };
export const defaultGameAlloc = (): EditorAlloc => ({ kind: "remainder", value: 0 }); // all-remainder → equal split
export const defaultPeriodAlloc = (s: Structure): Record<string, EditorAlloc> =>
  Object.fromEntries(PERIOD_PRESETS[s].map((p) => [p.key, { kind: "percent", value: p.weightPct } as EditorAlloc]));
const editorToEngine = (a: EditorAlloc): Alloc =>
  a.kind === "amount" ? { kind: "amount", value: Math.round(a.value * 100) } : a.kind === "percent" ? { kind: "percent", value: a.value } : { kind: "remainder", value: 0 };
export const editorToStored = (a: EditorAlloc) =>
  a.kind === "amount" ? { kind: "amount", value: Math.round(a.value * 100) } : a.kind === "percent" ? { kind: "percent", value: a.value } : { kind: "remainder", value: 0 };
export const storedToEditor = (a: { kind?: unknown; value?: unknown } | null | undefined): EditorAlloc | null => {
  if (!a || typeof a !== "object") return null;
  if (a.kind === "remainder") return { kind: "remainder", value: 0 };
  if ((a.kind === "amount" || a.kind === "percent") && typeof a.value === "number") {
    return { kind: a.kind, value: a.kind === "amount" ? a.value / 100 : a.value };
  }
  return null;
};

type TeamRef = { name?: string; abbrev?: string; espn_id?: string; logo?: string; color?: string } | null;

export type StoredAlloc = { kind: "amount" | "percent" | "remainder"; value: number };
export interface StoredGame {
  espnEventId: string;
  league: string;
  label: string | null;
  teamRow: TeamRef;
  teamCol: TeamRef;
  startTime: string | null;
  gameAlloc: StoredAlloc | null; // { kind, value } — value in CENTS for amount
  periodAlloc: Record<string, StoredAlloc> | null;
}

export interface SquaresContestRow {
  id: string;
  name: string;
  status: string;
  phase: string; // config.phase: setup|primary|secondary|closed|locked|final
  cellCostCents: number;
  potAllocation: "equal" | "round_weighted" | "custom";
  periodWeights: Record<string, Record<string, number>>;
  maxSquaresPrimary: number;
  maxSquaresSecondary: number | null;
  primaryEndsAt: string | null;
  secondaryEndsAt: string | null;
  revealLeadMinutes: number;
  claimedCount: number; // squares already owned — locks the price (accounting integrity)
  collectedBy: string | null;
  games: StoredGame[];
}

export const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
export const dateLabel = (iso: string | null, timeZone: string): string =>
  formatInstant(iso, timeZone, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** A dollar/percent/remainder input: a number field + a $ | % | Rest toggle. */
export function AllocInput({ alloc, onChange, allowRemainder, restLabel, compact }: { alloc: EditorAlloc; onChange: (a: EditorAlloc) => void; allowRemainder?: boolean; restLabel?: string; compact?: boolean }) {
  return (
    <span className={styles.alloc} data-compact={compact || undefined}>
      {alloc.kind === "remainder" ? (
        <span className={styles.allocRest}>{restLabel ?? "the rest"}</span>
      ) : (
        <input
          className={styles.allocNum}
          type="number"
          inputMode="decimal"
          min="0"
          value={alloc.value || ""}
          placeholder="0"
          onChange={(e) => onChange({ kind: alloc.kind, value: Math.max(0, Number(e.target.value) || 0) })}
        />
      )}
      <span className={styles.allocToggle} role="group">
        <button type="button" data-on={alloc.kind === "amount" || undefined} onClick={() => onChange({ kind: "amount", value: alloc.value })}>$</button>
        <button type="button" data-on={alloc.kind === "percent" || undefined} onClick={() => onChange({ kind: "percent", value: alloc.value })}>%</button>
        {allowRemainder && (
          <button type="button" data-on={alloc.kind === "remainder" || undefined} title="Gets whatever's left" onClick={() => onChange({ kind: "remainder", value: 0 })}>Rest</button>
        )}
      </span>
    </span>
  );
}

/** A collapsible section in the editor modal — header shows a summary when closed. */
function Section({ title, summary, open, onToggle, children }: { title: string; summary?: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className={styles.section}>
      <button type="button" className={styles.sectionHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.sectionTitle}>{title}</span>
        {!open && summary ? <span className={styles.sectionSummary}>{summary}</span> : <span className={styles.sectionSpacer} />}
        <svg className={styles.chev} data-open={open || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </div>
  );
}

const teamRef = (c: EspnGame["home"]): TeamRef =>
  c ? { name: c.name, abbrev: c.abbrev, espn_id: c.espnId, logo: c.logo ?? undefined, color: c.color ?? undefined } : null;

// Rebuild a picker-ready EspnGame from a stored game (teamRow = away, teamCol = home).
function toEspnGame(g: StoredGame): EspnGame {
  const comp = (r: TeamRef, homeAway: "home" | "away"): EspnGame["home"] =>
    r ? { espnId: r.espn_id ?? "", name: r.name ?? r.abbrev ?? "", shortName: r.name ?? r.abbrev ?? "", abbrev: r.abbrev ?? "", logo: r.logo ?? null, color: r.color ?? null, homeAway, score: null } : null;
  return {
    espnEventId: g.espnEventId,
    league: g.league,
    shortName: g.label ?? `${g.teamRow?.abbrev ?? "?"} @ ${g.teamCol?.abbrev ?? "?"}`,
    startTime: g.startTime ?? "",
    state: "pre",
    statusDetail: "",
    tv: null,
    // AWAY is stored on rows, HOME on columns (board convention).
    home: comp(g.teamCol, "home"),
    away: comp(g.teamRow, "away"),
  };
}

// Seed the per-game ($) and per-period allocation editor maps from a stored contest.
function seedAllocs(editing: SquaresContestRow | null): { ga: Record<string, EditorAlloc>; pa: Record<string, Record<string, EditorAlloc>> } {
  const ga: Record<string, EditorAlloc> = {};
  const pa: Record<string, Record<string, EditorAlloc>> = {};
  if (!editing) return { ga, pa };
  for (const sg of editing.games) {
    ga[sg.espnEventId] = storedToEditor(sg.gameAlloc) ?? defaultGameAlloc();
    const s = getLeague(sg.league)?.periods;
    if (s === "quarters" || s === "halves") {
      pa[sg.espnEventId] = Object.fromEntries(
        PERIOD_PRESETS[s].map((p) => [p.key, storedToEditor(sg.periodAlloc?.[p.key]) ?? ({ kind: "percent", value: p.weightPct } as EditorAlloc)]),
      );
    }
  }
  return { ga, pa };
}

/**
 * The Squares create/edit modal — scope-agnostic. Mounted by the group hub
 * (SquaresAdmin) and by the event contests admin; `collectionBase` is the contests
 * collection API root (POST to create, PATCH/DELETE `${base}/${id}` to edit). Any
 * aspect of the pool, including the game slate, is editable here at any time.
 */
export default function SquaresEditor({
  collectionBase,
  editing,
  eventId = null,
  nameMode = "nickname",
  currentUserId = "",
  gamesOnly = false,
  timeZone,
  onClose = () => {},
  onSaved,
}: {
  collectionBase: string;
  editing: SquaresContestRow | null; // null = create
  // When set, a newly-created pool is EVENT-scoped (event_id). Omitted/null =
  // group-scoped. Editing an existing pool never changes its scope.
  eventId?: string | null;
  nameMode?: NameMode;       // for the collector picker's member names (edit mode only)
  currentUserId?: string;    // pre-selected collector (the active admin)
  timeZone: string;          // event/org zone for the draft-window summary labels
  // When true, render ONLY the Games & payouts section and save a games-only partial
  // (basics/draft live in the gear). Used by the "+ Add games" button on the detail page.
  gamesOnly?: boolean;
  onClose?: () => void;
  onSaved?: () => void;
}) {
  const router = useRouter();
  const editingId = editing?.id ?? null;
  // Org id lives in the collection base: /api/v2/orgs/<orgId>/contests
  const orgId = collectionBase.split("/")[4] ?? "";
  const seeded = seedAllocs(editing);

  const [name, setName] = useState(editing?.name ?? "");
  const [collectedBy, setCollectedBy] = useState(editing?.collectedBy ?? currentUserId);
  const [costStr, setCostStr] = useState(editing ? formatStake(editing.cellCostCents / 100) : "10");
  const [games, setGames] = useState<EspnGame[]>(editing ? editing.games.map(toEspnGame) : []);
  // No UI control today — the pot-allocation mode is seeded and left as-is (edits
  // happen per-game via the $/%/remainder allocs below).
  const [potAllocation] = useState<"equal" | "round_weighted" | "custom">(editing?.potAllocation ?? "equal");
  const [periodWeights, setPeriodWeights] = useState<Record<string, Record<string, number>>>(
    editing && Object.keys(editing.periodWeights).length ? editing.periodWeights : {},
  );
  const [galloc, setGalloc] = useState<Record<string, EditorAlloc>>(seeded.ga);
  const [palloc, setPalloc] = useState<Record<string, Record<string, EditorAlloc>>>(seeded.pa);
  const [openGameId, setOpenGameId] = useState<string | null>(null);
  const [maxPrimaryStr, setMaxPrimaryStr] = useState(editing ? String(editing.maxSquaresPrimary) : "10");
  const [secondaryUnlimited, setSecondaryUnlimited] = useState(editing ? editing.maxSquaresSecondary == null : true);
  const [maxSecondaryStr, setMaxSecondaryStr] = useState(editing ? String(editing.maxSquaresSecondary ?? 20) : "20");
  const [primaryEndsIso, setPrimaryEndsIso] = useState<string | null>(editing ? editing.primaryEndsAt : null);
  const [secondaryEndsIso, setSecondaryEndsIso] = useState<string | null>(editing ? editing.secondaryEndsAt : null);
  const [revealLeadValue, setRevealLeadValue] = useState(() => decomposeLead(editing ? editing.revealLeadMinutes : DEFAULT_LEAD_MINUTES).value);
  const [revealLeadUnit, setRevealLeadUnit] = useState<LeadUnit>(() => decomposeLead(editing ? editing.revealLeadMinutes : DEFAULT_LEAD_MINUTES).unit);
  // "Visible to members" — the first open/hide (phase setup ↔ primary). Once buying
  // moves past primary, visibility is governed on the pool page, so the toggle locks.
  const [vphase, setVphase] = useState(editing?.phase ?? "setup");
  const [visible, setVisible] = useState(editing?.status === "active");
  const [togglingVis, setTogglingVis] = useState(false);
  const canToggleVisibility = !!editingId && (vphase === "setup" || vphase === "primary");
  const [clearedPicks, setClearedPicks] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [openSec, setOpenSec] = useState<Record<string, boolean>>(
    editing ? { basics: true, draft: false, games: true, payouts: false } : { basics: true, draft: true, games: true, payouts: false },
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cost = parseStake(costStr);
  // Once squares are owned, the price is fixed — changing it would scramble who owes
  // what. Clearing all picks (back to setup) unlocks it.
  const priceLocked = !!editing && editing.claimedCount > 0 && !clearedPicks;
  // Distinct game structures among the picked games (NCAA = halves, NBA/NFL = quarters).
  const structures = Array.from(
    new Set(games.map((g) => getLeague(g.league)?.periods).filter((x): x is Structure => x === "quarters" || x === "halves")),
  );
  // Projected pot (all 100 squares sold), resolved through the flexible engine so
  // the editor previews exactly what each game + period will pay.
  const potCents = Math.round((cost ?? 0) * 100) * 100;
  const allocGames: GameAllocation[] = games.map((g) => {
    const s = getLeague(g.league)?.periods;
    const periods =
      s === "quarters" || s === "halves"
        ? PERIOD_PRESETS[s].map((p) => ({ key: p.key, label: p.label, alloc: editorToEngine(palloc[g.espnEventId]?.[p.key] ?? { kind: "percent", value: p.weightPct }) }))
        : [];
    return { key: g.espnEventId, game: editorToEngine(galloc[g.espnEventId] ?? defaultGameAlloc()), periods };
  });
  const resolved = resolvePayouts(potCents, allocGames);
  const resolvedByGame = new Map(resolved.games.map((rg) => [rg.key, rg]));
  const hasRemainderGame = allocGames.some((g) => g.game.kind === "remainder");

  // Seed default period weights whenever a new structure appears (keeps edits).
  useEffect(() => {
    const present = games.map((g) => getLeague(g.league)?.periods).filter((x): x is Structure => x === "quarters" || x === "halves");
    setPeriodWeights((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const s of present) {
        if (!next[s] || Object.keys(next[s]).length === 0) {
          next[s] = defaultWeights(s);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [games]);

  // Seed + prune per-game payout allocations as games are added/removed.
  useEffect(() => {
    const ids = new Set(games.map((g) => g.espnEventId));
    setGalloc((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of games) if (!next[g.espnEventId]) { next[g.espnEventId] = defaultGameAlloc(); changed = true; }
      for (const id of Object.keys(next)) if (!ids.has(id)) { delete next[id]; changed = true; }
      return changed ? next : prev;
    });
    setPalloc((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const g of games) {
        const s = getLeague(g.league)?.periods;
        if ((s === "quarters" || s === "halves") && !next[g.espnEventId]) { next[g.espnEventId] = defaultPeriodAlloc(s); changed = true; }
      }
      for (const id of Object.keys(next)) if (!ids.has(id)) { delete next[id]; changed = true; }
      return changed ? next : prev;
    });
  }, [games]);

  useEffect(() => {
    // While the game picker is stacked on top, let IT handle Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpen) onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [pickerOpen, onClose]);

  async function save() {
    if (saving) return;
    if (!gamesOnly && !name.trim()) return setErr("Give it a name.");
    if (games.length === 0) return setErr("Pick at least one game.");
    // Block when payouts exceed the full-board pot (over-promised)…
    if (potCents > 0 && resolved.shortfallCents > 0) {
      return setErr(`Payouts exceed the pot by ${money(resolved.shortfallCents)}. Lower some amounts or use "the rest".`);
    }
    // …and when any game's periods don't add up to what that game pays (money
    // assigned to the game that reaches no square).
    if (potCents > 0) {
      for (const rg of resolved.games) {
        if (rg.periods.length === 0) continue;
        const psum = rg.periods.reduce((t, p) => t + p.cents, 0);
        if (psum !== rg.cents) {
          const gm = games.find((x) => x.espnEventId === rg.key);
          return setErr(`${gm?.shortName ?? "A game"}: periods add up to ${money(psum)}, but the game pays ${money(rg.cents)}. Make them match.`);
        }
      }
    }
    // The auto-advance cron runs these dates in order (primary close → secondary
    // close → number reveal), so they must be chronological before we save.
    const timelineErr = validateSquaresTimeline({
      primaryEndsAt: primaryEndsIso,
      secondaryEndsAt: secondaryEndsIso,
      revealLeadMinutes: Math.max(1, parseInt(revealLeadValue, 10) || 0) * LEAD_UNITS[revealLeadUnit],
      gameStartTimes: games.map((g) => g.startTime || null),
    });
    if (timelineErr) return setErr(timelineErr);
    setSaving(true);
    setErr(null);
    // Detail-page games/payouts editor: send ONLY the games + payout config (basics/
    // draft are owned by the gear). The full editor (create/full edit) sends all.
    const basics = gamesOnly
      ? {}
      : {
          collected_by: collectedBy || null,
          ...(editingId ? {} : { contest_type: "squares", event_id: eventId ?? null }),
          name: name.trim(),
          cell_cost_cents: Math.round((cost ?? 0) * 100),
          max_squares_primary: Math.max(1, parseInt(maxPrimaryStr, 10) || 1),
          max_squares_secondary: secondaryUnlimited ? null : Math.max(1, parseInt(maxSecondaryStr, 10) || 1),
          primary_ends_at: primaryEndsIso,
          secondary_ends_at: secondaryEndsIso,
          reveal_lead_minutes: Math.max(1, (parseInt(revealLeadValue, 10) || 0)) * LEAD_UNITS[revealLeadUnit],
        };
    const payload = {
      ...basics,
      pot_allocation: potAllocation,
      period_weights: Object.fromEntries(structures.map((s) => [s, periodWeights[s] ?? defaultWeights(s)])),
      games: games.map((g) => {
        const s = getLeague(g.league)?.periods;
        const pa = s === "quarters" || s === "halves" ? palloc[g.espnEventId] : null;
        return {
          espnEventId: g.espnEventId,
          league: g.league,
          label: g.shortName,
          // Board convention: HOME on top (columns), AWAY on the left (rows).
          teamRow: teamRef(g.away),
          teamCol: teamRef(g.home),
          startTime: g.startTime || null,
          gameAlloc: editorToStored(galloc[g.espnEventId] ?? defaultGameAlloc()),
          periodAlloc: pa ? Object.fromEntries(Object.entries(pa).map(([k, v]) => [k, editorToStored(v)])) : null,
        };
      }),
    };
    try {
      const res = await fetch(
        editingId ? `${collectionBase}/${editingId}` : collectionBase,
        { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "Could not save.");
        setSaving(false);
        return;
      }
      onSaved?.();
      onClose();
      router.refresh();
    } catch {
      setErr("Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!editingId || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`${collectionBase}/${editingId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Could not delete.");
        setSaving(false);
        return;
      }
      onSaved?.();
      onClose();
      router.refresh();
    } catch {
      setErr("Something went wrong.");
      setSaving(false);
    }
  }

  async function toggleVisible() {
    if (togglingVis || !canToggleVisibility || !editingId) return;
    const next = !visible;
    setTogglingVis(true); setErr(null); setVisible(next);
    try {
      const res = await fetch(`${collectionBase}/${editingId}/squares/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: next ? "open_primary" : "back_to_setup" }),
      });
      if (res.ok) { const d = await res.json().catch(() => ({})); setVphase(d.phase ?? (next ? "primary" : "setup")); router.refresh(); }
      else { setVisible(!next); setErr((await res.json().catch(() => ({}))).error || "Could not change visibility"); }
    } catch { setVisible(!next); setErr("Could not change visibility"); } finally { setTogglingVis(false); }
  }

  async function clearPicks() {
    if (clearing || !editingId) return;
    setClearing(true); setErr(null);
    try {
      const res = await fetch(`${collectionBase}/${editingId}/squares/action`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear_picks" }),
      });
      if (!res.ok) { setErr((await res.json().catch(() => ({}))).error || "Could not clear picks"); setClearing(false); return; }
      setClearedPicks(true); setConfirmClear(false); setVphase("setup"); setVisible(false); router.refresh();
    } catch { setErr("Could not clear picks"); } finally { setClearing(false); }
  }

  const inner = (
    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
      <div className={styles.formHead}>
        <span className={styles.formTitle}>{editingId ? "Edit Squares pool" : "New Squares pool"}</span>
        <button type="button" className={styles.cancel} onClick={onClose}>Cancel</button>
      </div>

            <div className={styles.modalBody}>
              {!gamesOnly && (<>
              <Section
                title="Basics"
                open={openSec.basics}
                onToggle={() => setOpenSec((o) => ({ ...o, basics: !o.basics }))}
                summary={`${name || "Untitled"}, ${money(Math.round((cost ?? 0) * 100))}/square`}
              >
                <label className={styles.label}>Name</label>
                <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. March Madness Squares" />
                <label className={styles.label}>Price per square</label>
                <div className={styles.cost}>
                  <span style={{ position: "relative", display: "inline-block" }}>
                    <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--ink-soft, #59635b)", fontWeight: 700, pointerEvents: "none" }}>$</span>
                    <input value={costStr} inputMode="decimal" disabled={priceLocked} style={{ paddingLeft: 22, opacity: priceLocked ? 0.6 : 1 }} onChange={(e) => setCostStr(e.target.value)} onBlur={() => setCostStr(formatStake(cost))} />
                  </span>
                  {priceLocked
                    ? <span className={styles.costNote}>Locked, {editing!.claimedCount} claimed</span>
                    : <span className={styles.costNote}>pot fills to {money(Math.round((cost ?? 0) * 100) * 100)} if all 100 sell</span>}
                </div>
                {priceLocked && (
                  confirmClear ? (
                    <span className={styles.delInline}>
                      <span className={styles.capHint}>Clear every claimed square and start over?</span>
                      <button type="button" className={styles.delConfirm} onClick={clearPicks} disabled={clearing}>{clearing ? "…" : "Yes, clear"}</button>
                      <button type="button" className={styles.cancel} onClick={() => setConfirmClear(false)}>No</button>
                    </span>
                  ) : (
                    <button type="button" className={styles.delBtn} onClick={() => setConfirmClear(true)}>Clear all picks to reprice</button>
                  )
                )}
                <ContestCollector
                  base={editingId ? `${collectionBase}/${editingId}` : collectionBase}
                  orgId={orgId}
                  nameMode={nameMode}
                  currentUserId={currentUserId}
                  initialCollectedBy={editing?.collectedBy ?? null}
                  value={collectedBy}
                  onChange={setCollectedBy}
                  labelClassName={styles.label}
                  selectClassName={styles.selectInput}
                />
                {editingId && (
                  <div style={{ marginTop: 10 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: "0.9rem", cursor: canToggleVisibility ? "pointer" : "default", opacity: canToggleVisibility ? 1 : 0.6 }}>
                      <input type="checkbox" checked={visible} disabled={!canToggleVisibility || togglingVis} onChange={toggleVisible} />
                      <span>Visible to members</span>
                    </label>
                    {!canToggleVisibility && <p className={styles.capHint} style={{ marginTop: 4 }}>Buying is underway — manage visibility on the pool page.</p>}
                  </div>
                )}
              </Section>

              <Section
                title="Draft"
                open={openSec.draft}
                onToggle={() => setOpenSec((o) => ({ ...o, draft: !o.draft }))}
                summary={`Primary ${maxPrimaryStr}, secondary ${secondaryUnlimited ? "unlimited" : maxSecondaryStr}${primaryEndsIso ? `, ends ${dateLabel(primaryEndsIso, timeZone)}` : ""}`}
              >
                <div className={styles.draftGroup}>
                  <div className={styles.draftGroupTitle}>Primary draft</div>
                  <label className={styles.label}>Max squares per person</label>
                  <input className={styles.capInput} value={maxPrimaryStr} inputMode="numeric" onChange={(e) => setMaxPrimaryStr(e.target.value.replace(/\D/g, ""))} />
                  <ZonedDateTimeField label="Ends" value={primaryEndsIso} timeZone={timeZone} onChange={setPrimaryEndsIso} inputClassName={styles.input} labelClassName={styles.label} />
                </div>

                <div className={styles.draftGroup}>
                  <div className={styles.draftGroupTitle}>Secondary draft</div>
                  <label className={styles.label}>Max squares per person</label>
                  <div className={styles.capRow}>
                    <div className={styles.seg} role="group" aria-label="Secondary cap">
                      <button type="button" data-on={secondaryUnlimited || undefined} onClick={() => setSecondaryUnlimited(true)}>Unlimited</button>
                      <button type="button" data-on={!secondaryUnlimited || undefined} onClick={() => setSecondaryUnlimited(false)}>Limit</button>
                    </div>
                    {!secondaryUnlimited && (
                      <input className={styles.capInput} value={maxSecondaryStr} inputMode="numeric" onChange={(e) => setMaxSecondaryStr(e.target.value.replace(/\D/g, ""))} />
                    )}
                  </div>
                  <ZonedDateTimeField label="Ends" optional value={secondaryEndsIso} timeZone={timeZone} onChange={setSecondaryEndsIso} inputClassName={styles.input} labelClassName={styles.label} />
                </div>

                <div className={styles.draftGroup}>
                  <div className={styles.draftGroupTitle}>Number reveal</div>
                  <label className={styles.label}>Draw numbers before each game</label>
                  <div className={styles.capRow}>
                    <input className={styles.capInput} value={revealLeadValue} inputMode="numeric" placeholder="30" onChange={(e) => setRevealLeadValue(e.target.value.replace(/\D/g, ""))} />
                    <select className={styles.selectInput} style={{ width: 130 }} value={revealLeadUnit} onChange={(e) => setRevealLeadUnit(e.target.value as LeadUnit)}>
                      <option value="minutes">minutes</option>
                      <option value="hours">hours</option>
                      <option value="days">days</option>
                    </select>
                  </div>
                </div>
              </Section>
              </>)}

              <Section
                title="Games & payouts"
                open={openSec.games}
                onToggle={() => setOpenSec((o) => ({ ...o, games: !o.games }))}
                summary={games.length === 0 ? "No games yet" : potCents > 0 ? `${games.length} game${games.length === 1 ? "" : "s"}, pot ${money(potCents)}` : `${games.length} game${games.length === 1 ? "" : "s"}`}
              >
                {games.length === 0 ? (
                  <>
                    <p className={styles.capHint}>Add the games this pool covers, then set what each one pays.</p>
                    <button type="button" className={styles.addGame} onClick={() => setPickerOpen(true)}>+ Add games</button>
                  </>
                ) : (
                  <>
                    <p className={styles.payHint}>Tap a game to set its cut of the pot and how that cut splits across periods. Every field is a dollar amount or a percent; set one game (e.g. the final) to <b>Rest</b> to soak up the leftover.</p>
                    {games.map((g) => {
                      const s = getLeague(g.league)?.periods;
                      const struct = s === "quarters" || s === "halves" ? s : null;
                      const ga = galloc[g.espnEventId] ?? defaultGameAlloc();
                      const rg = resolvedByGame.get(g.espnEventId);
                      const isOpen = openGameId === g.espnEventId;
                      const sameStruct = struct ? games.filter((x) => getLeague(x.league)?.periods === struct) : [];
                      return (
                        <div key={g.espnEventId} className={styles.payGame} data-open={isOpen || undefined}>
                          <button type="button" className={styles.payGameHead} onClick={() => setOpenGameId(isOpen ? null : g.espnEventId)}>
                            <span className={styles.payGameName}>
                              {g.shortName}
                              <span className={styles.payGameSub}>
                                <span className={styles.payGameLeague}>{getLeague(g.league)?.label ?? g.league}</span>
                                {g.startTime && <span className={styles.payGameWhen}>{formatInstant(g.startTime, timeZone, { weekday: "short", month: "short", day: "numeric" })}</span>}
                              </span>
                            </span>
                            <span className={styles.payGameTotal}>
                              {potCents > 0 ? money(rg?.cents ?? 0) : ga.kind === "remainder" ? "the rest" : money(0)}
                              {ga.kind === "remainder" && <span className={styles.payRestTag}>rest</span>}
                            </span>
                            <svg className={styles.chev} data-open={isOpen || undefined} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                          </button>
                          {isOpen && (
                            <div className={styles.payGameBody}>
                              <div className={styles.payRow}>
                                <span className={styles.payRowLabel}>Game pays</span>
                                <AllocInput
                                  alloc={ga}
                                  allowRemainder
                                  restLabel={potCents > 0 ? money(rg?.cents ?? 0) : "the rest"}
                                  onChange={(a) =>
                                    setGalloc((prev) => {
                                      const next = { ...prev, [g.espnEventId]: a };
                                      // Only ONE game may be "the rest": picking it here clears any other.
                                      if (a.kind === "remainder") {
                                        for (const id of Object.keys(next)) {
                                          if (id !== g.espnEventId && next[id]?.kind === "remainder") next[id] = { kind: "amount", value: 0 };
                                        }
                                      }
                                      return next;
                                    })
                                  }
                                />
                              </div>
                              {struct && (
                                <div className={styles.payPeriodList}>
                                  {PERIOD_PRESETS[struct].map((p) => {
                                    const pa = palloc[g.espnEventId]?.[p.key] ?? { kind: "percent", value: p.weightPct };
                                    const cents = rg?.periods.find((x) => x.key === p.key)?.cents ?? 0;
                                    return (
                                      <div key={p.key} className={styles.payPeriodRow}>
                                        <span className={styles.payPeriodName}>{p.label}</span>
                                        <AllocInput alloc={pa} compact onChange={(a) => setPalloc((prev) => ({ ...prev, [g.espnEventId]: { ...(prev[g.espnEventId] ?? defaultPeriodAlloc(struct)), [p.key]: a } }))} />
                                        <span className={styles.payPeriodCents}>{potCents > 0 ? money(cents) : ""}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                              <div className={styles.payActions}>
                                {struct && potCents > 0 && (() => {
                                  const periodSum = rg?.periods.reduce((t, p) => t + p.cents, 0) ?? 0;
                                  const gameCents = rg?.cents ?? 0;
                                  const ok = periodSum === gameCents;
                                  return (
                                    <span className={styles.payReconcile} data-ok={ok || undefined} data-bad={!ok || undefined}>
                                      {ok ? `Adds up to ${money(gameCents)} ✓` : `${money(periodSum)} of ${money(gameCents)} — must match`}
                                    </span>
                                  );
                                })()}
                                <span className={styles.payActionBtns}>
                                  {struct && sameStruct.length > 1 && ga.kind !== "remainder" && (
                                    <button
                                      type="button"
                                      className={styles.payApplyAll}
                                      onClick={() => {
                                        const srcGame = galloc[g.espnEventId] ?? defaultGameAlloc();
                                        const srcPer = palloc[g.espnEventId] ?? defaultPeriodAlloc(struct);
                                        // Don't propagate "the rest" to every game (only one may hold it).
                                        if (srcGame.kind !== "remainder") {
                                          setGalloc((prev) => { const n = { ...prev }; for (const x of sameStruct) n[x.espnEventId] = { ...srcGame }; return n; });
                                        }
                                        setPalloc((prev) => { const n = { ...prev }; for (const x of sameStruct) n[x.espnEventId] = { ...srcPer }; return n; });
                                      }}
                                    >
                                      Apply to all {sameStruct.length}
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    className={styles.payRemove}
                                    onClick={() => {
                                      setGames(games.filter((x) => x.espnEventId !== g.espnEventId));
                                      if (openGameId === g.espnEventId) setOpenGameId(null);
                                    }}
                                  >
                                    Remove
                                  </button>
                                </span>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <button type="button" className={styles.addGame} onClick={() => setPickerOpen(true)}>+ Add games</button>
                    {potCents > 0 && (() => {
                      const restGame = games.find((x) => (galloc[x.espnEventId] ?? defaultGameAlloc()).kind === "remainder");
                      const periodsBalanced = resolved.games.every((rg) => rg.periods.length === 0 || rg.periods.reduce((t, p) => t + p.cents, 0) === rg.cents);
                      const allGood = resolved.unallocatedCents === 0 && resolved.shortfallCents === 0 && periodsBalanced;
                      return (
                        <div className={styles.payFooter}>
                          <div className={styles.payFootRow}><span>Pot (full board)</span><b>{money(potCents)}</b></div>
                          <div className={styles.payFootRow}><span>{hasRemainderGame ? "Set amounts" : "Assigned"}</span><b>{money(resolved.committedCents)}</b></div>
                          {hasRemainderGame && (
                            <div className={styles.payFootRow}><span>The rest → {restGame?.shortName ?? "a game"}</span><b>{money(Math.max(0, potCents - resolved.committedCents))}</b></div>
                          )}
                          {resolved.unallocatedCents > 0 && (
                            <div className={styles.payFootRow} data-warn><span>Unassigned (add a &ldquo;rest&rdquo; game)</span><b>{money(resolved.unallocatedCents)}</b></div>
                          )}
                          {resolved.shortfallCents > 0 && (
                            <div className={styles.payFootRow} data-bad><span>Over the pot by</span><b>{money(resolved.shortfallCents)}</b></div>
                          )}
                          {allGood ? (
                            <div className={styles.payFootStatus} data-ok>Fully allocated, $0 remaining ✓</div>
                          ) : !periodsBalanced ? (
                            <div className={styles.payFootStatus} data-bad>A game&apos;s periods don&apos;t add up to what it pays</div>
                          ) : (
                            <div className={styles.payFootStatus} data-bad={resolved.shortfallCents > 0 || undefined}>
                              {money(resolved.shortfallCents > 0 ? resolved.shortfallCents : resolved.unallocatedCents)} {resolved.shortfallCents > 0 ? "over" : "unassigned"}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </>
                )}
              </Section>
            </div>

            <div className={styles.modalFooter}>
              {err && <p className={styles.err}>{err}</p>}
              <div className={styles.footerRow}>
                {!gamesOnly && editingId &&
                  (confirmDel ? (
                    <span className={styles.delInline}>
                      <button type="button" className={styles.delConfirm} onClick={remove} disabled={saving}>Delete?</button>
                      <button type="button" className={styles.cancel} onClick={() => setConfirmDel(false)}>No</button>
                    </span>
                  ) : (
                    <button type="button" className={styles.delBtn} onClick={() => setConfirmDel(true)}>Delete</button>
                  ))}
                <button type="button" className={styles.create} onClick={save} disabled={saving}>
                  {saving ? "Saving…" : gamesOnly ? "Save games & payouts" : editingId ? "Save changes" : "Create pool"}
                </button>
              </div>
            </div>
          </div>
  );

  return (
    <>
      {/* Rendered inline (not portaled to document.body) so it stays inside the org's
          themed wrapper and inherits --brand etc. — like Modal/ConfirmModal do. */}
      <div className={styles.overlay} onClick={onClose}>{inner}</div>

      {pickerOpen && (
        <GameSelectModal value={games} onChange={setGames} onClose={() => setPickerOpen(false)} initialLeague={games[0]?.league} />
      )}
    </>
  );
}
