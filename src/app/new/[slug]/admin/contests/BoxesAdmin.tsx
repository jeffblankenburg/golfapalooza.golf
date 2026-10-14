"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import styles from "./BoxesAdmin.module.css";
import GameSelectModal from "@/components/v2/sports/GameSelectModal";
import { parseStake, formatStake } from "@/lib/v2/rounds/stake";
import { getLeague, type EspnGame } from "@/lib/v2/sports/espn";
import { PERIOD_PRESETS, gamePotShares, periodPayouts } from "@/lib/v2/contests/boxes";

type Structure = "quarters" | "halves";
const defaultWeights = (s: Structure): Record<string, number> =>
  Object.fromEntries(PERIOD_PRESETS[s].map((p) => [p.key, p.weightPct]));

type TeamRef = { name?: string; abbrev?: string; espn_id?: string; logo?: string; color?: string } | null;

export interface StoredGame {
  espnEventId: string;
  league: string;
  label: string | null;
  teamRow: TeamRef;
  teamCol: TeamRef;
}

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
    startTime: "",
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

  const cost = parseStake(costStr);
  // Distinct game structures among the picked games (NCAA = halves, NBA/NFL = quarters).
  const structures = Array.from(
    new Set(games.map((g) => getLeague(g.league)?.periods).filter((x): x is Structure => x === "quarters" || x === "halves")),
  );
  // Projected pot (all 100 squares sold) and each game's share, for the live values.
  const potCents = Math.round((cost ?? 0) * 100) * 100;
  const gameShares = gamePotShares(games.length, potCents, potAllocation);

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
    for (const s of structures) {
      const w = periodWeights[s] ?? defaultWeights(s);
      const sum = PERIOD_PRESETS[s].reduce((t, p) => t + (Number(w[p.key]) || 0), 0);
      if (sum !== 100) return setErr(`${s === "quarters" ? "Quarter" : "Half"} payouts must total 100% (now ${sum}%).`);
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
      games: games.map((g) => ({
        espnEventId: g.espnEventId,
        league: g.league,
        label: g.shortName,
        // Board convention: HOME on top (columns), AWAY on the left (rows).
        teamRow: teamRef(g.away),
        teamCol: teamRef(g.home),
      })),
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
              title="Games"
              open={openSec.games}
              onToggle={() => setOpenSec((o) => ({ ...o, games: !o.games }))}
              summary={games.length === 0 ? "No games yet" : `${games.length} game${games.length === 1 ? "" : "s"}`}
            >
              <div className={styles.selGames}>
                {games.length === 0 && <span className={styles.selEmpty}>No games picked yet.</span>}
                {games.map((g, i) => {
                  const struct = getLeague(g.league)?.periods;
                  const gCents = gameShares[i] ?? 0;
                  const pays = struct === "quarters" || struct === "halves" ? periodPayouts(gCents, PERIOD_PRESETS[struct], periodWeights[struct]) : [];
                  return (
                    <div key={g.espnEventId} className={styles.selGame}>
                      <div className={styles.selTop}>
                        <span className={styles.selMatch}>{g.shortName}</span>
                        <span className={styles.selLeague}>{getLeague(g.league)?.label ?? g.league}</span>
                        {potCents > 0 && <span className={styles.selValue}>{money(gCents)}</span>}
                        <button type="button" className={styles.selRemove} onClick={() => setGames(games.filter((x) => x.espnEventId !== g.espnEventId))} aria-label="Remove game">×</button>
                      </div>
                      {potCents > 0 && pays.length > 0 && (
                        <div className={styles.selPays}>
                          {pays.map((p) => (
                            <span key={p.key} className={styles.selPay}>{p.label} <b>{money(p.cents)}</b></span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <button type="button" className={styles.addGame} onClick={() => setPickerOpen(true)}>+ Add game{games.length ? "s" : ""}</button>
            </Section>

            <Section
              title="Payouts"
              open={openSec.payouts}
              onToggle={() => setOpenSec((o) => ({ ...o, payouts: !o.payouts }))}
              summary={games.length === 0 ? "Pick games first" : games.length > 1 ? (potAllocation === "equal" ? "Equal split" : "Weighted split") : "By period"}
            >
              {games.length === 0 && <p className={styles.capHint}>Pick a game to set its payouts.</p>}
              {games.length > 1 && (
                <>
                  <label className={styles.label}>Each game&apos;s share of the pot</label>
                  <div className={styles.seg} role="group" aria-label="Pot allocation">
                    <button type="button" data-on={potAllocation === "equal" || undefined} onClick={() => setPotAllocation("equal")}>Equal</button>
                    <button type="button" data-on={potAllocation === "round_weighted" || undefined} onClick={() => setPotAllocation("round_weighted")}>Later rounds more</button>
                  </div>
                </>
              )}
              {structures.map((s) => {
                const defs = PERIOD_PRESETS[s];
                const w = periodWeights[s] ?? defaultWeights(s);
                const sum = defs.reduce((t, p) => t + (Number(w[p.key]) || 0), 0);
                return (
                  <div key={s} className={styles.periodBlock}>
                    <label className={styles.label}>
                      Payout by period{structures.length > 1 ? ` — ${s === "quarters" ? "Quarters" : "Halves"}` : ""}
                    </label>
                    {structures.length > 1 && (
                      <span className={styles.periodApplies}>
                        {games.filter((g) => getLeague(g.league)?.periods === s).map((g) => g.shortName).join(", ")}
                      </span>
                    )}
                    <div className={styles.periodGrid}>
                      {defs.map((p) => (
                        <label key={p.key} className={styles.periodCell}>
                          <span className={styles.periodName}>{p.label}</span>
                          <span className={styles.periodPct}>
                            <input
                              value={w[p.key] ?? 0}
                              inputMode="numeric"
                              onChange={(e) => {
                                const n = Math.max(0, Math.min(100, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0));
                                setPeriodWeights((prev) => ({ ...prev, [s]: { ...(prev[s] ?? defaultWeights(s)), [p.key]: n } }));
                              }}
                            />
                            %
                          </span>
                        </label>
                      ))}
                    </div>
                    <span className={styles.periodSum} data-ok={sum === 100 || undefined}>Total {sum}%</span>
                  </div>
                );
              })}
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
          const shares = gamePotShares(c.games.length, c.cellCostCents * 100, c.potAllocation);
          return (
            <div key={c.id} className={styles.rowWrap}>
              <Link href={`/new/${slug}/admin/contests/${c.id}`} className={styles.row}>
                <span className={styles.rowName}>{c.name}</span>
                <span className={styles.rowMeta}>
                  {money(c.cellCostCents)}/square, {money(c.cellCostCents * 100)} pot, {c.status}
                </span>
                <span className={styles.rowGames}>
                  {c.games.map((g, i) => (
                    <span key={g.espnEventId} className={styles.rowGame}>
                      {g.label || "Game"} <b>{money(shares[i] ?? 0)}</b>
                    </span>
                  ))}
                </span>
              </Link>
              <button type="button" className={styles.rowGear} onClick={() => openEdit(c)} aria-label="Edit settings" title="Edit settings">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
