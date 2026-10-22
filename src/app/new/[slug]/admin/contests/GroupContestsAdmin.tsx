"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import styles from "./BoxesAdmin.module.css";
import { resolvePayouts } from "@/lib/v2/contests/boxes";
import { buildGameAllocations } from "@/lib/v2/contests/boxes-alloc";
import BoxesEditor, { money, dateLabel, type BoxesContestRow } from "./BoxesEditor";

// One unified list for the group Contests hub — every created pool, any type,
// in one place (no per-type sections), with a single "Add contest" control.
export type GroupContestItem =
  | { kind: "boxes"; id: string; createdAt: string; box: BoxesContestRow }
  | { kind: "pickem"; id: string; createdAt: string; name: string; status: string };

// Contest types an admin can create at the group level today.
const ADDABLE = [
  { key: "boxes", label: "Boxes pool", blurb: "Squares grid for any games" },
  { key: "pickem", label: "Pick'em", blurb: "Pick games vs. the spread" },
] as const;

const statusLabel = (s: string) => (s === "active" ? "Open" : s === "draft" ? "Draft" : s);

/** The glyph for a contest type — shared by the list badge and the add menu. */
function ContestTypeIcon({ kind, size = 13 }: { kind: "boxes" | "pickem"; size?: number }) {
  return kind === "boxes" ? (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M8 12l2.5 2.5L16 9" />
    </svg>
  );
}

/** Contest-type badge — glyph + label, matching the home-page type tags. */
function ContestTypeTag({ kind }: { kind: "boxes" | "pickem" }) {
  return (
    <span className={styles.typeTag}>
      <ContestTypeIcon kind={kind} />
      {kind === "boxes" ? "Squares" : "Pick'em"}
    </span>
  );
}

export default function GroupContestsAdmin({ orgId, slug, items }: { orgId: string; slug: string; items: GroupContestItem[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionBase = `/api/v2/orgs/${orgId}/contests`;
  const adminBase = `/new/${slug}/admin/contests`;

  const [menuOpen, setMenuOpen] = useState(false);
  // undefined = Boxes editor closed; null = creating; a row = editing that pool.
  const [editing, setEditing] = useState<BoxesContestRow | null | undefined>(undefined);
  const [pickemOpen, setPickemOpen] = useState(false);
  const [pickemName, setPickemName] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleRow = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  // Open the Boxes editor when linked from a pool's manage page (?edit=<id>).
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const it = items.find((x) => x.kind === "boxes" && x.id === editId);
    if (it && it.kind === "boxes") setEditing(it.box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function pick(kind: string) {
    setMenuOpen(false);
    if (kind === "boxes") setEditing(null);
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

      {editing !== undefined && (
        <BoxesEditor collectionBase={collectionBase} editing={editing} onClose={() => setEditing(undefined)} />
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
          it.kind === "boxes" ? <BoxesRow key={it.id} c={it.box} adminBase={adminBase} isOpen={expanded.has(it.id)} onToggle={() => toggleRow(it.id)} onEdit={() => setEditing(it.box)} /> : (
            <Link key={it.id} href={`${adminBase}/${it.id}`} className={styles.rowWrap} style={{ display: "block", textDecoration: "none" }}>
              <div className={styles.rowHead}>
                <span className={styles.rowMain} style={{ cursor: "pointer" }}>
                  <span className={styles.rowHeadText}>
                    <ContestTypeTag kind="pickem" />
                    <span className={styles.rowName}>{it.name}</span>
                    <span className={styles.rowMeta}>{statusLabel(it.status)}</span>
                  </span>
                  <svg className={styles.rowChev} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M9 5l7 7-7 7" /></svg>
                </span>
              </div>
            </Link>
          ),
        )}
      </div>
    </div>
  );
}

/** One Boxes pool in the list — expandable (game table) with a gear to edit. */
function BoxesRow({ c, adminBase, isOpen, onToggle, onEdit }: { c: BoxesContestRow; adminBase: string; isOpen: boolean; onToggle: () => void; onEdit: () => void }) {
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
            <ContestTypeTag kind="boxes" />
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
