"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import ConfirmModal from "@/app/new/_components/ConfirmModal";
import styles from "@/app/new/new.module.css";

export interface SideGame {
  id: string;
  contest_type: string;
  name: string;
  holes: number[] | null;
  config: Record<string, unknown> | null;
  entry_amount_cents: number | null;
  winner_user_id: string | null;
  declared_no_winner: boolean;
  skins_results?: { rows: { team: string; skins: number }[]; pending: number } | null;
}
interface Player { user_id: string; name: string }
export interface HoleInfo { hole_number: number; par: number; yards: number | null; tee_color: string | null; tee_name: string | null }

/** Map a tee-color name to a CSS color for the swatch; falls back to neutral gray. */
const TEE_SWATCH: Record<string, string> = {
  white: "#f5f5f5", black: "#1b1b1b", blue: "#2f5fd0", red: "#d0392f", gold: "#c9a227",
  silver: "#b8b8b8", green: "#2f8f3f", yellow: "#e8c53a", orange: "#e08a2f", purple: "#7a3fb0",
  gray: "#9a9a9a", grey: "#9a9a9a", copper: "#b06a33", bronze: "#a97142", teal: "#2f9f9f", pink: "#e06aa0",
};
function teeSwatch(color: string | null): string {
  return (color && TEE_SWATCH[color.trim().toLowerCase()]) || "#c4c4c4";
}
function holeMeta(h: HoleInfo | undefined): string {
  if (!h) return "";
  const parts = [`Par ${h.par}`];
  if (h.yards) parts.push(`${h.yards} yds`);
  return parts.join(", ");
}

const TYPES = [
  { key: "skins", label: "Skins", derived: true },
  { key: "ctp", label: "Closest to Pin", derived: false },
  { key: "long_drive", label: "Long Drive", derived: false },
  { key: "long_putt", label: "Long Putt", derived: false },
];
const TYPE_LABEL: Record<string, string> = Object.fromEntries(TYPES.map((t) => [t.key, t.label]));

function dollars(cents: number | null): string {
  if (cents == null) return "";
  return `$${(cents / 100).toFixed(cents % 100 === 0 ? 0 : 2)}`;
}

/**
 * Side games on a scramble (#209, 2b). Add Skins / CTP / Long Drive / Long Putt as
 * child contests; CTP/LD/LP winners are recorded manually here, Skins is derived
 * from the scorecard (results view lands next). Admins only.
 */
export default function SideGames({
  orgId,
  eventId,
  scrambleId,
  players,
  holes,
  initialSideGames,
}: {
  orgId: string;
  eventId: string;
  scrambleId: string;
  players: Player[];
  holes: HoleInfo[];
  initialSideGames: SideGame[];
}) {
  const router = useRouter();
  const holeNums = holes.map((h) => h.hole_number);
  const holeOf = (n: number) => holes.find((h) => h.hole_number === n);
  const [formFor, setFormFor] = useState<SideGame | "new" | null>(null);
  const [winnerFor, setWinnerFor] = useState<SideGame | null>(null);
  const [confirmDel, setConfirmDel] = useState<SideGame | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [holePicking, setHolePicking] = useState(false);
  const [busy, setBusy] = useState(false);

  function toggleExpand(id: string) {
    setExpanded((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }

  // Add-form state.
  const [type, setType] = useState("skins");
  const [name, setName] = useState("");
  const [buyin, setBuyin] = useState("");
  const [skinsType, setSkinsType] = useState("net");
  const [carryover, setCarryover] = useState(true);
  const [hole, setHole] = useState(holeNums[0] ?? 1);

  const nameOf = (uid: string | null) => players.find((p) => p.user_id === uid)?.name ?? null;
  // Skins is a singleton per scramble; CTP / Long Drive / Long Putt can repeat.
  const hasSkins = initialSideGames.some((g) => g.contest_type === "skins");
  const [addError, setAddError] = useState<string | null>(null);

  function openAdd() {
    setType(hasSkins ? "ctp" : "skins"); setName(""); setBuyin(""); setSkinsType("net"); setCarryover(true); setHole(holeNums[0] ?? 1);
    setAddError(null);
    setFormFor("new");
  }
  function openEdit(g: SideGame) {
    const cfg = (g.config || {}) as { skins_type?: string; carryover?: boolean };
    setType(g.contest_type);
    setName(g.name || "");
    setBuyin(g.entry_amount_cents != null ? (g.entry_amount_cents / 100).toString() : "");
    setSkinsType(cfg.skins_type === "gross" ? "gross" : "net");
    setCarryover(cfg.carryover !== false);
    setHole(g.holes?.[0] ?? holeNums[0] ?? 1);
    setAddError(null);
    setFormFor(g);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || formFor == null) return;
    setBusy(true);
    const cents = buyin.trim() ? Math.round(parseFloat(buyin) * 100) : null;
    const isManual = type !== "skins";
    const payload = {
      name: name.trim() || null,
      entry_amount_cents: Number.isFinite(cents) ? cents : null,
      holes: isManual ? [hole] : null,
      config: type === "skins" ? { skins_type: skinsType, carryover } : null,
    };
    const res = formFor === "new"
      ? await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ parent_contest_id: scrambleId, contest_type: type, ...payload }),
        })
      : await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests/${formFor.id}`, {
          method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
        });
    setBusy(false);
    if (res.ok) { setFormFor(null); router.refresh(); }
    else setAddError((await res.json().catch(() => ({}))).error || "Could not save");
  }

  async function setWinner(sideId: string, uid: string | null) {
    if (busy) return;
    setBusy(true);
    const res = await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests/${sideId}/winner`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: uid }),
    });
    setBusy(false);
    if (res.ok) { setWinnerFor(null); router.refresh(); }
  }

  async function remove(sideId: string) {
    setBusy(true);
    const res = await fetch(`/api/v2/orgs/${orgId}/events/${eventId}/contests/${sideId}`, { method: "DELETE" });
    setBusy(false);
    if (res.ok) { setConfirmDel(null); router.refresh(); }
  }

  function summary(g: SideGame): string {
    const parts: string[] = [];
    if (g.contest_type === "skins") {
      const cfg = g.config || {};
      parts.push(cfg.skins_type === "gross" ? "Gross" : "Net");
      if (cfg.carryover) parts.push("carryover");
    } else if (g.holes?.length) {
      parts.push(`Hole ${g.holes[0]}`);
    }
    const buy = dollars(g.entry_amount_cents);
    if (buy) parts.push(buy);
    return parts.join(", ");
  }

  function winnerLine(g: SideGame): string {
    if (g.contest_type === "skins") return "From the scorecard";
    if (g.winner_user_id) return `Winner: ${nameOf(g.winner_user_id) || "Member"}`;
    if (g.declared_no_winner) return "No winner";
    return "Winner not set";
  }

  return (
    <div className={styles.section}>
      <div className={styles.titleRow}>
        <p className={styles.sectionLabel} style={{ marginBottom: 0 }}>Side games</p>
        <button type="button" className={styles.circleAdd} aria-label="Add side game" onClick={openAdd}>
          <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
        </button>
      </div>

      {initialSideGames.length === 0 ? (
        <p className={styles.dnsHint} style={{ marginTop: 10 }}>No side games yet. Add Skins, Closest to Pin, Long Drive, or Long Putt.</p>
      ) : (
        <div className={styles.sideList}>
          {initialSideGames.map((g) =>
            g.contest_type === "skins" ? (
              <div key={g.id} className={styles.sideAcc} data-open={expanded.has(g.id) || undefined}>
                <div
                  className={styles.sideAccHead}
                  role="button"
                  tabIndex={0}
                  aria-expanded={expanded.has(g.id)}
                  onClick={() => toggleExpand(g.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleExpand(g.id); } }}
                >
                  <span className={styles.sideMain}>
                    <span className={styles.sideNameRow}>
                      <span className={styles.sideName}>{g.name || "Skins"}</span>
                      <button type="button" className={styles.sideEditBtn} aria-label="Edit side game" onClick={(e) => { e.stopPropagation(); openEdit(g); }}>
                        <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
                      </button>
                    </span>
                    <span className={styles.sideMeta}>{summary(g)}</span>
                  </span>
                  <svg className={styles.sideChevron} data-open={expanded.has(g.id) || undefined} width="18" height="18" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M6 9l6 6 6-6" />
                  </svg>
                </div>
                {expanded.has(g.id) && (
                  <div className={styles.sideBody}>
                    {g.skins_results && g.skins_results.rows.some((r) => r.skins > 0) ? (
                      <div className={styles.skinsResults}>
                        {g.skins_results.rows.map((r, i) => (
                          <div key={i} className={styles.skinsRow}>
                            <span className={styles.skinsTeam}>{r.team}</span>
                            <span className={styles.skinsCount}>{r.skins}</span>
                          </div>
                        ))}
                        {g.skins_results.pending > 0 && (
                          <p className={styles.sideMeta} style={{ marginTop: 8 }}>{g.skins_results.pending} hole{g.skins_results.pending === 1 ? "" : "s"} not yet decided.</p>
                        )}
                      </div>
                    ) : (
                      <p className={styles.dnsHint}>No skins decided yet. Enter scores on the scorecard.</p>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
                      <button type="button" className={styles.deleteBtn} onClick={() => setConfirmDel(g)}>Delete Skins</button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div key={g.id} className={styles.sideCard}>
                <div className={styles.sideMain}>
                  <span className={styles.sideNameRow}>
                    <span className={styles.sideName}>{g.name || TYPE_LABEL[g.contest_type] || "Side game"}</span>
                    <button type="button" className={styles.sideEditBtn} aria-label="Edit side game" onClick={() => openEdit(g)}>
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z" /></svg>
                    </button>
                  </span>
                  <span className={styles.sideMeta}>{summary(g)}</span>
                  <span className={styles.sideWinner}>{winnerLine(g)}</span>
                </div>
                <div className={styles.sideActions}>
                  <button type="button" className={styles.linkActionBox} onClick={() => setWinnerFor(g)}>
                    {g.winner_user_id || g.declared_no_winner ? "Winner" : "Set winner"}
                  </button>
                  <button type="button" className={styles.sideRemove} aria-label="Remove side game" onClick={() => setConfirmDel(g)}>
                    <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
            ),
          )}
        </div>
      )}

      {/* Add / edit side game (hidden while the hole picker is open, one at a time) */}
      <Modal open={formFor !== null && !holePicking} title={formFor === "new" ? "Add side game" : "Edit side game"} onClose={() => { setFormFor(null); setHolePicking(false); }}>
        <form className={styles.form} onSubmit={submit}>
          <div className={styles.field}>
            <label className={styles.label}>Game</label>
            {formFor === "new" ? (
              <div className={styles.pillRow} role="group" aria-label="Side game type">
                {TYPES.map((t) => {
                  const disabled = t.key === "skins" && hasSkins;
                  return (
                    <button key={t.key} type="button" className={styles.pill} data-on={type === t.key || undefined} disabled={disabled} title={disabled ? "Only one Skins game per scramble" : undefined} onClick={() => setType(t.key)}>{t.label}</button>
                  );
                })}
              </div>
            ) : (
              <p className={styles.sideFixedType}>{TYPE_LABEL[type]}</p>
            )}
          </div>

          {type === "skins" ? (
            <>
              <div className={styles.field}>
                <label className={styles.label}>Scoring</label>
                <div className={styles.pillRow} role="group" aria-label="Skins scoring">
                  <button type="button" className={styles.pill} data-on={skinsType === "net" || undefined} onClick={() => setSkinsType("net")}>Net</button>
                  <button type="button" className={styles.pill} data-on={skinsType === "gross" || undefined} onClick={() => setSkinsType("gross")}>Gross</button>
                </div>
              </div>
              <label className={styles.profileToggle}>
                <input type="checkbox" checked={carryover} onChange={(e) => setCarryover(e.target.checked)} />
                <span>Carry over tied holes</span>
              </label>
            </>
          ) : (
            <div className={styles.field}>
              <label className={styles.label}>Hole</label>
              <button type="button" className={styles.teeBox} onClick={() => setHolePicking(true)}>
                <span className={styles.teeBoxMain}>
                  <span className={styles.coursePickedName}>Hole {hole}</span>
                  <span className={styles.coursePickMeta}>
                    <span className={styles.holeSwatch} style={{ background: teeSwatch(holeOf(hole)?.tee_color ?? null) }} />
                    {holeOf(hole)?.tee_name ? `${holeOf(hole)!.tee_name}, ` : ""}{holeMeta(holeOf(hole))}
                  </span>
                </span>
                <span className={styles.linkAction}>Change</span>
              </button>
            </div>
          )}

          <div className={styles.profileTwoCol}>
            <div className={styles.field}>
              <label className={styles.label}>Name <span className={styles.optional}>(optional)</span></label>
              <input className={styles.input} value={name} onChange={(e) => setName(e.target.value)} placeholder={TYPE_LABEL[type]} maxLength={60} />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Buy-in <span className={styles.optional}>($)</span></label>
              <input className={styles.input} inputMode="decimal" value={buyin} onChange={(e) => setBuyin(e.target.value)} placeholder="0" />
            </div>
          </div>

          {addError && <p className={styles.formError}>{addError}</p>}

          <button type="submit" className={styles.createBtn} disabled={busy} style={{ opacity: busy ? 0.6 : 1 }}>
            {busy ? "Saving…" : formFor === "new" ? "Add side game" : "Save changes"}
          </button>
        </form>
      </Modal>

      {/* Custom hole picker (par, distance, tee color) — no stock dropdown */}
      <Modal open={holePicking} title="Choose hole" onClose={() => setHolePicking(false)}>
        <div className={styles.coursePickList}>
          {holes.map((h) => (
            <button
              key={h.hole_number}
              type="button"
              className={styles.coursePickRow}
              data-on={h.hole_number === hole || undefined}
              onClick={() => { setHole(h.hole_number); setHolePicking(false); }}
            >
              <span className={styles.coursePickName}>Hole {h.hole_number}</span>
              <span className={styles.coursePickMeta}>
                <span className={styles.holeSwatch} style={{ background: teeSwatch(h.tee_color) }} />
                {h.tee_name ? `${h.tee_name}, ` : ""}{holeMeta(h)}
              </span>
            </button>
          ))}
        </div>
      </Modal>

      {/* Record winner (manual contests) */}
      <Modal open={!!winnerFor} title={winnerFor ? `${winnerFor.name || TYPE_LABEL[winnerFor.contest_type]} winner` : ""} onClose={() => setWinnerFor(null)}>
        {winnerFor && (
          <div className={styles.winnerList}>
            {players.map((p) => (
              <button key={p.user_id} type="button" className={styles.winnerRow} data-on={winnerFor.winner_user_id === p.user_id || undefined} onClick={() => setWinner(winnerFor.id, p.user_id)}>
                {p.name}
              </button>
            ))}
            <button type="button" className={styles.winnerRow} data-none data-on={winnerFor.declared_no_winner || undefined} onClick={() => setWinner(winnerFor.id, null)}>
              No winner
            </button>
          </div>
        )}
      </Modal>

      <ConfirmModal
        open={!!confirmDel}
        title="Remove side game?"
        message={confirmDel ? `Remove "${confirmDel.name || TYPE_LABEL[confirmDel.contest_type]}"? Its winner record is deleted too.` : undefined}
        confirmLabel={busy ? "Removing…" : "Remove"}
        destructive
        onConfirm={() => confirmDel && remove(confirmDel.id)}
        onCancel={() => !busy && setConfirmDel(null)}
      />
    </div>
  );
}
