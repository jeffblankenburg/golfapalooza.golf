"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./BoxesAdmin.module.css";
import GameSelectModal from "@/components/v2/sports/GameSelectModal";
import { parseStake, formatStake } from "@/lib/v2/rounds/stake";
import { getLeague, type EspnGame } from "@/lib/v2/sports/espn";
import { PERIOD_PRESETS, resolvePayouts, type Alloc, type GameAllocation } from "@/lib/v2/contests/boxes";
import { buildGameAllocations } from "@/lib/v2/contests/boxes-alloc";

type Structure = "quarters" | "halves";
const defaultWeights = (s: Structure): Record<string, number> =>
  Object.fromEntries(PERIOD_PRESETS[s].map((p) => [p.key, p.weightPct]));

// Editor allocation — like the engine's Alloc, but `amount` is held in DOLLARS for
// the input (converted to cents at the storage/engine boundary).
type EditorAlloc = { kind: "amount" | "percent" | "remainder"; value: number };
const defaultGameAlloc = (): EditorAlloc => ({ kind: "remainder", value: 0 }); // all-remainder → equal split
const defaultPeriodAlloc = (s: Structure): Record<string, EditorAlloc> =>
  Object.fromEntries(PERIOD_PRESETS[s].map((p) => [p.key, { kind: "percent", value: p.weightPct } as EditorAlloc]));
const editorToEngine = (a: EditorAlloc): Alloc =>
  a.kind === "amount" ? { kind: "amount", value: Math.round(a.value * 100) } : a.kind === "percent" ? { kind: "percent", value: a.value } : { kind: "remainder", value: 0 };
const editorToStored = (a: EditorAlloc) =>
  a.kind === "amount" ? { kind: "amount", value: Math.round(a.value * 100) } : a.kind === "percent" ? { kind: "percent", value: a.value } : { kind: "remainder", value: 0 };
const storedToEditor = (a: { kind?: unknown; value?: unknown } | null | undefined): EditorAlloc | null => {
  if (!a || typeof a !== "object") return null;
  if (a.kind === "remainder") return { kind: "remainder", value: 0 };
  if ((a.kind === "amount" || a.kind === "percent") && typeof a.value === "number") {
    return { kind: a.kind, value: a.kind === "amount" ? a.value / 100 : a.value };
  }
  return null;
};

/** A dollar/percent/remainder input: a number field + a $ | % | Rest toggle. */
function AllocInput({ alloc, onChange, allowRemainder, restLabel, compact, styles }: { alloc: EditorAlloc; onChange: (a: EditorAlloc) => void; allowRemainder?: boolean; restLabel?: string; compact?: boolean; styles: Record<string, string> }) {
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

type TeamRef = { name?: string; abbrev?: string; espn_id?: string; logo?: string; color?: string } | null;

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
export type StoredAlloc = { kind: "amount" | "percent" | "remainder"; value: number };

export interface BoxesContestRow {
  id: string;
  name: string;
  status: string;
  cellCostCents: number;
  potAllocation: "equal" | "round_weighted" | "custom";
  periodWeights: Record<string, Record<string, number>>;
  maxSquaresPrimary: number;
  maxSquaresSecondary: number | null;
  primaryEndsAt: string | null;
  secondaryEndsAt: string | null;
  games: StoredGame[];
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;
const isoToLocal = (iso: string | null): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
const localToISO = (s: string): string | null => (s ? new Date(s).toISOString() : null);
const dateLabel = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "";

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

// Rebuild a picker-ready EspnGame from a stored game (teamRow = home, teamCol = away).
function toEspnGame(g: StoredGame): EspnGame {
  const comp = (r: TeamRef, homeAway: "home" | "away"): EspnGame["home"] =>
    r ? { espnId: r.espn_id ?? "", name: r.name ?? r.abbrev ?? "", abbrev: r.abbrev ?? "", logo: r.logo ?? null, color: r.color ?? null, homeAway, score: null } : null;
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

export default function BoxesAdmin({ orgId, slug, contests }: { orgId: string; slug: string; contests: BoxesContestRow[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [costStr, setCostStr] = useState("10");
  const [games, setGames] = useState<EspnGame[]>([]);
  const [potAllocation, setPotAllocation] = useState<"equal" | "round_weighted" | "custom">("equal");
  const [periodWeights, setPeriodWeights] = useState<Record<string, Record<string, number>>>({});
  // Flexible per-game payout allocation, keyed by espnEventId ($ / % / remainder).
  const [galloc, setGalloc] = useState<Record<string, EditorAlloc>>({});
  const [palloc, setPalloc] = useState<Record<string, Record<string, EditorAlloc>>>({});
  const [openGameId, setOpenGameId] = useState<string | null>(null);
  const [maxPrimaryStr, setMaxPrimaryStr] = useState("10");
  const [secondaryUnlimited, setSecondaryUnlimited] = useState(true);
  const [maxSecondaryStr, setMaxSecondaryStr] = useState("20");
  const [primaryEndsStr, setPrimaryEndsStr] = useState("");
  const [secondaryEndsStr, setSecondaryEndsStr] = useState("");
  const [openSec, setOpenSec] = useState<Record<string, boolean>>({ basics: true, draft: true, games: true, payouts: false });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // Which pools are expanded in the list (collapsed by default).
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const cost = parseStake(costStr);
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
    if (!open) return;
    // While the game picker is stacked on top, let IT handle Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pickerOpen) close();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, pickerOpen]);

  // Open the editor when linked from a pool's detail page (?edit=<id>).
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const c = contests.find((x) => x.id === editId);
    if (c) openEdit(c);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function openCreate() {
    setEditingId(null);
    setName("");
    setCostStr("10");
    setGames([]);
    setPotAllocation("equal");
    setPeriodWeights({});
    setGalloc({});
    setPalloc({});
    setOpenGameId(null);
    setMaxPrimaryStr("10");
    setSecondaryUnlimited(true);
    setMaxSecondaryStr("20");
    setPrimaryEndsStr("");
    setSecondaryEndsStr("");
    setOpenSec({ basics: true, draft: true, games: true, payouts: false });
    setErr(null);
    setConfirmDel(false);
    setOpen(true);
  }
  function openEdit(c: BoxesContestRow) {
    setEditingId(c.id);
    setName(c.name);
    setCostStr(formatStake(c.cellCostCents / 100));
    setGames(c.games.map(toEspnGame));
    setPotAllocation(c.potAllocation);
    setPeriodWeights(c.periodWeights && Object.keys(c.periodWeights).length ? c.periodWeights : {});
    // Seed per-game allocations from storage (cents→dollars), default where unset.
    const ga: Record<string, EditorAlloc> = {};
    const pa: Record<string, Record<string, EditorAlloc>> = {};
    for (const sg of c.games) {
      ga[sg.espnEventId] = storedToEditor(sg.gameAlloc) ?? defaultGameAlloc();
      const s = getLeague(sg.league)?.periods;
      if (s === "quarters" || s === "halves") {
        pa[sg.espnEventId] = Object.fromEntries(
          PERIOD_PRESETS[s].map((p) => [p.key, storedToEditor(sg.periodAlloc?.[p.key]) ?? ({ kind: "percent", value: p.weightPct } as EditorAlloc)]),
        );
      }
    }
    setGalloc(ga);
    setPalloc(pa);
    setOpenGameId(null);
    setMaxPrimaryStr(String(c.maxSquaresPrimary));
    setSecondaryUnlimited(c.maxSquaresSecondary == null);
    setMaxSecondaryStr(String(c.maxSquaresSecondary ?? 20));
    setPrimaryEndsStr(isoToLocal(c.primaryEndsAt));
    setSecondaryEndsStr(isoToLocal(c.secondaryEndsAt));
    setOpenSec({ basics: true, draft: false, games: true, payouts: false });
    setErr(null);
    setConfirmDel(false);
    setOpen(true);
  }
  function close() {
    setOpen(false);
    setPickerOpen(false);
    setErr(null);
    setConfirmDel(false);
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) return setErr("Give it a name.");
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
    setSaving(true);
    setErr(null);
    const payload = {
      ...(editingId ? {} : { contest_type: "boxes" }),
      name: name.trim(),
      cell_cost_cents: Math.round((cost ?? 0) * 100),
      pot_allocation: potAllocation,
      period_weights: Object.fromEntries(structures.map((s) => [s, periodWeights[s] ?? defaultWeights(s)])),
      max_squares_primary: Math.max(1, parseInt(maxPrimaryStr, 10) || 1),
      max_squares_secondary: secondaryUnlimited ? null : Math.max(1, parseInt(maxSecondaryStr, 10) || 1),
      primary_ends_at: localToISO(primaryEndsStr),
      secondary_ends_at: localToISO(secondaryEndsStr),
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
        editingId ? `/api/v2/orgs/${orgId}/contests/${editingId}` : `/api/v2/orgs/${orgId}/contests`,
        { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErr(d.error || "Could not save.");
        setSaving(false);
        return;
      }
      close();
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
      const res = await fetch(`/api/v2/orgs/${orgId}/contests/${editingId}`, { method: "DELETE" });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setErr(d.error || "Could not delete.");
        setSaving(false);
        return;
      }
      close();
      router.refresh();
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

      <button type="button" className={styles.add} onClick={openCreate}>+ Add Boxes pool</button>

      {open && createPortal(
        <div className={styles.overlay} onClick={close}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.formHead}>
            <span className={styles.formTitle}>{editingId ? "Edit Boxes pool" : "New Boxes pool"}</span>
            <button type="button" className={styles.cancel} onClick={close}>Cancel</button>
          </div>

          <div className={styles.modalBody}>
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
                <span>$</span>
                <input value={costStr} inputMode="decimal" onChange={(e) => setCostStr(e.target.value)} onBlur={() => setCostStr(formatStake(cost))} />
                <span className={styles.costNote}>pot fills to {money(Math.round((cost ?? 0) * 100) * 100)} if all 100 sell</span>
              </div>
            </Section>

            <Section
              title="Draft"
              open={openSec.draft}
              onToggle={() => setOpenSec((o) => ({ ...o, draft: !o.draft }))}
              summary={`Primary ${maxPrimaryStr}, secondary ${secondaryUnlimited ? "unlimited" : maxSecondaryStr}${primaryEndsStr ? `, ends ${dateLabel(localToISO(primaryEndsStr))}` : ""}`}
            >
              <label className={styles.label}>Squares per person</label>
              <div className={styles.caps}>
                <label className={styles.capField}>
                  <span className={styles.capName}>Primary draft</span>
                  <input className={styles.capInput} value={maxPrimaryStr} inputMode="numeric" onChange={(e) => setMaxPrimaryStr(e.target.value.replace(/\D/g, ""))} />
                </label>
                <div className={styles.capField}>
                  <span className={styles.capName}>Secondary draft</span>
                  <div className={styles.capRow}>
                    <div className={styles.seg} role="group" aria-label="Secondary cap">
                      <button type="button" data-on={secondaryUnlimited || undefined} onClick={() => setSecondaryUnlimited(true)}>Unlimited</button>
                      <button type="button" data-on={!secondaryUnlimited || undefined} onClick={() => setSecondaryUnlimited(false)}>Limit</button>
                    </div>
                    {!secondaryUnlimited && (
                      <input className={styles.capInput} value={maxSecondaryStr} inputMode="numeric" onChange={(e) => setMaxSecondaryStr(e.target.value.replace(/\D/g, ""))} />
                    )}
                  </div>
                </div>
              </div>
              <p className={styles.capHint}>Primary caps everyone equally; secondary opens after, to sell out the board.</p>
              <label className={styles.label}>Primary draft ends</label>
              <input className={styles.input} type="datetime-local" value={primaryEndsStr} onChange={(e) => setPrimaryEndsStr(e.target.value)} />
              <label className={styles.label}>Secondary draft ends (optional)</label>
              <input className={styles.input} type="datetime-local" value={secondaryEndsStr} onChange={(e) => setSecondaryEndsStr(e.target.value)} />
              <p className={styles.capHint}>Primary ends → secondary begins. Leave secondary blank to close it by hand — you can always close picks early from the pool page.</p>
            </Section>

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
                            <span className={styles.payGameLeague}>{getLeague(g.league)?.label ?? g.league}</span>
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
                                styles={styles}
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
                                      <AllocInput alloc={pa} compact styles={styles} onChange={(a) => setPalloc((prev) => ({ ...prev, [g.espnEventId]: { ...(prev[g.espnEventId] ?? defaultPeriodAlloc(struct)), [p.key]: a } }))} />
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
              {editingId &&
                (confirmDel ? (
                  <span className={styles.delInline}>
                    <button type="button" className={styles.delConfirm} onClick={remove} disabled={saving}>Delete?</button>
                    <button type="button" className={styles.cancel} onClick={() => setConfirmDel(false)}>No</button>
                  </span>
                ) : (
                  <button type="button" className={styles.delBtn} onClick={() => setConfirmDel(true)}>Delete</button>
                ))}
              <button type="button" className={styles.create} onClick={save} disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save changes" : "Create pool"}
              </button>
            </div>
          </div>
          </div>
        </div>,
        document.body,
      )}

      {pickerOpen && (
        <GameSelectModal value={games} onChange={setGames} onClose={() => setPickerOpen(false)} initialLeague={games[0]?.league} />
      )}

      <div className={styles.list}>
        {contests.length === 0 && !open && <p className={styles.empty}>No pools yet. Add one above.</p>}
        {contests.map((c) => {
          // Full-board value of each game via the flexible $/%/remainder engine.
          const cPot = c.cellCostCents * 100;
          const cAlloc = buildGameAllocations(
            c.games.map((g) => ({ id: g.espnEventId, league: g.league, game_alloc: g.gameAlloc, period_alloc: g.periodAlloc })),
            cPot,
            { potAllocation: c.potAllocation, periodWeights: c.periodWeights },
          );
          const centsByGame = new Map(resolvePayouts(cPot, cAlloc).games.map((rg) => [rg.key, rg.cents]));
          const restId = c.games.find((g) => g.gameAlloc?.kind === "remainder")?.espnEventId;
          const isOpen = expanded.has(c.id);
          // Games listed in kickoff order; undated (TBD) games sort to the end.
          const orderedGames = [...c.games].sort((a, b) => {
            if (!a.startTime) return 1;
            if (!b.startTime) return -1;
            return a.startTime.localeCompare(b.startTime);
          });
          return (
            <div key={c.id} className={styles.rowWrap} data-open={isOpen || undefined}>
              <div className={styles.rowHead}>
                <button type="button" className={styles.rowMain} onClick={() => toggleRow(c.id)} aria-expanded={isOpen}>
                  <span className={styles.rowHeadText}>
                    <span className={styles.rowName}>{c.name}</span>
                    <span className={styles.rowMeta}>{money(c.cellCostCents)}/square, {money(cPot)} pot, {c.status}</span>
                    <span className={styles.rowCount}>{c.games.length} game{c.games.length === 1 ? "" : "s"}</span>
                  </span>
                  <svg className={styles.rowChev} data-open={isOpen || undefined} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </button>
                <button type="button" className={styles.rowGear} onClick={() => openEdit(c)} aria-label="Edit settings" title="Edit settings">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                  </svg>
                </button>
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
                  <Link href={`/new/${slug}/admin/contests/${c.id}`} className={styles.manageLink}>Manage pool →</Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
