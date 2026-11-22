"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Modal from "@/app/new/_components/Modal";
import styles from "./SquaresAdmin.module.css";
import SquaresEditor, { money, type SquaresContestRow } from "./SquaresEditor";
import ContestCard, { ContestTypeIcon } from "@/app/new/_components/contest-card/ContestCard";
import AuctionSettingsModal from "@/app/new/_components/AuctionSettingsModal";
import { PickemPreview, SquaresPreview } from "@/app/new/_components/contest-card/previews";
import { pickName, type NameMode } from "@/lib/v2/profile";
import { computePickemPayouts, type PayoutSplit } from "@/lib/v2/contests/pickem";
import { placeLabel } from "@/lib/v2/contests/payouts";
import { formatInstant } from "@/lib/v2/timezone";
import type { PickemGamePreview } from "@/lib/v2/contests/pickem-preview";
import PayoutSplitsEditor from "../events/[eventId]/contests/[contestId]/PayoutSplitsEditor";
import ThreesGamePicker from "./ThreesGamePicker";
import PropsSettings from "./[contestId]/PropsSettings";
import type { EspnGameInput } from "@/lib/v2/contests/pickem-server";
import ConfirmModal from "@/app/new/_components/ConfirmModal";

// One unified list for the group Contests hub — every created pool, any type,
// in one place (no per-type sections), with a single "Add contest" control.
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
      lockMode: "slate" | "per_game";
      participantCount: number;
      games: PickemGamePreview[];
    }
  | { kind: "auction"; id: string; createdAt: string; name: string; status: string; tournamentName: string | null; participantCount: number; complete: boolean }
  | { kind: "props"; id: string; createdAt: string; name: string; status: string; entryCents: number; locksAt: string | null; questionCount: number; participantCount: number }
  | { kind: "3s_and_ds"; id: string; createdAt: string; name: string; status: string; hasGame: boolean; gameDate: string | null };

// Contest types an admin can create at the group level today.
const ADDABLE = [
  { key: "squares", label: "Squares pool", blurb: "Squares grid for any games" },
  { key: "pickem", label: "Pick'em", blurb: "Pick games vs. the spread" },
  { key: "auction", label: "Auction", blurb: "Bid on a tournament's teams" },
  { key: "props", label: "Props", blurb: "Proposition questions you settle by hand" },
  { key: "3s_and_ds", label: "3s and Ds", blurb: "Live basketball wager board for the big screen" },
] as const;

type PickemItem = Extract<GroupContestItem, { kind: "pickem" }>;
type AuctionItem = Extract<GroupContestItem, { kind: "auction" }>;

// Member visibility: a draft contest is hidden; anything else (active/final) is public.
const visOf = (s: string): "public" | "hidden" => (s === "draft" ? "hidden" : "public");
const centsToStr = (c: number) => (c ? String(c / 100) : "");
function fmtMoney(cents: number): string {
  const whole = cents % 100 === 0;
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 })}`;
}

export default function GroupContestsAdmin({ orgId, slug, items, currentUserId, nameMode, timeZone }: { orgId: string; slug: string; items: GroupContestItem[]; currentUserId: string; nameMode: NameMode; timeZone: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const collectionBase = `/api/v2/orgs/${orgId}/contests`;
  const adminBase = `/new/${slug}/admin/contests`;

  const [menuOpen, setMenuOpen] = useState(false);
  // undefined = Squares editor closed; null = creating; a row = editing that pool.
  const [editing, setEditing] = useState<SquaresContestRow | null | undefined>(undefined);
  const [pickemOpen, setPickemOpen] = useState(false);
  const [nameKind, setNameKind] = useState<"pickem" | "auction" | "props">("pickem");
  const [threesPickerOpen, setThreesPickerOpen] = useState(false);
  const [toDelete, setToDelete] = useState<{ id: string; name: string } | null>(null);

  async function doDelete() {
    const t = toDelete;
    setToDelete(null);
    if (!t) return;
    await fetch(`${collectionBase}/${t.id}`, { method: "DELETE" }).catch(() => {});
    router.refresh();
  }
  const [pickemName, setPickemName] = useState("");
  const [settingsFor, setSettingsFor] = useState<PickemItem | null>(null);
  const [auctionSettingsFor, setAuctionSettingsFor] = useState<AuctionItem | null>(null);
  const [propsSettingsFor, setPropsSettingsFor] = useState<string | null>(null);
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
    if (it && it.kind === "squares") setEditing(it.box);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function pick(kind: string) {
    setMenuOpen(false);
    if (kind === "squares") setEditing(null);
    else if (kind === "pickem" || kind === "auction" || kind === "props") { setNameKind(kind); setPickemName(""); setErr(null); setPickemOpen(true); }
    else if (kind === "3s_and_ds") { setErr(null); setThreesPickerOpen(true); }
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
        body: JSON.stringify({ contest_type: nameKind, name: n }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Could not create."); setSaving(false); return; }
      router.push(`${adminBase}/${d.id}`);
    } catch {
      setErr("Something went wrong.");
      setSaving(false);
    }
  }

  async function createThrees(game: EspnGameInput) {
    if (saving) return;
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch(collectionBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contest_type: "3s_and_ds", game }),
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

      {/* ONE editor for both create (editing=null) and edit (editing=box) — the card
          gear routes here too, so there's a single squares settings interface. */}
      {editing !== undefined && (
        <SquaresEditor collectionBase={collectionBase} editing={editing} nameMode={nameMode} currentUserId={currentUserId} timeZone={timeZone} onClose={() => setEditing(undefined)} onSaved={() => router.refresh()} />
      )}

      <Modal open={pickemOpen} title={nameKind === "auction" ? "New Auction" : nameKind === "props" ? "New Props" : "New Pick'em"} onClose={() => setPickemOpen(false)}>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <input
            className={styles.input}
            style={{ width: "100%" }}
            value={pickemName}
            autoFocus
            onChange={(e) => setPickemName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createPickem(); }}
            placeholder={nameKind === "auction" ? "e.g. March Madness Auction" : nameKind === "props" ? "e.g. Super Bowl Props" : "e.g. Bowl Week Pick'em"}
          />
          {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
          <button type="button" className={styles.create} onClick={() => void createPickem()} disabled={saving || !pickemName.trim()}>
            {saving ? "Creating…" : "Create"}
          </button>
        </div>
      </Modal>

      {threesPickerOpen && (
        <ThreesGamePicker
          title="New 3s and Ds — pick a game"
          busy={saving}
          onPick={(g) => void createThrees(g)}
          onClose={() => setThreesPickerOpen(false)}
        />
      )}

      <div className={styles.list}>
        {items.length === 0 && editing === undefined && <p className={styles.empty}>No contests yet. Add one above.</p>}
        {items.map((it) =>
          it.kind === "squares" ? (
            <SquaresRow key={it.id} c={it.box} adminBase={adminBase} isOpen={expanded.has(it.id)} onToggle={() => toggleRow(it.id)} onEdit={() => setEditing(it.box)} timeZone={timeZone} />
          ) : it.kind === "auction" ? (
            <ContestCard key={it.id} kind="auction" name={it.name} visibility={visOf(it.status)}
              meta={[it.tournamentName || "No tournament", it.complete ? "complete" : null].filter(Boolean).join(", ")}
              count={`${it.participantCount} player${it.participantCount === 1 ? "" : "s"}`}
              detailHref={`${adminBase}/${it.id}`} detailLabel="Open auction"
              onGear={() => setAuctionSettingsFor(it)}
              isOpen={false} onToggle={() => router.push(`${adminBase}/${it.id}`)} />
          ) : it.kind === "props" ? (
            <ContestCard key={it.id} kind="props" name={it.name} visibility={visOf(it.status)}
              meta={[
                it.entryCents > 0 ? `${fmtMoney(it.entryCents)} buy-in` : "no buy-in",
                it.locksAt ? `locks ${formatInstant(it.locksAt, timeZone, { month: "short", day: "numeric" })}` : "no lock set",
              ].join(", ")}
              count={`${it.questionCount} question${it.questionCount === 1 ? "" : "s"}`}
              detailHref={`${adminBase}/${it.id}`} detailLabel="Open Props details"
              onGear={() => setPropsSettingsFor(it.id)}
              isOpen={false} onToggle={() => router.push(`${adminBase}/${it.id}`)} />
          ) : it.kind === "3s_and_ds" ? (
            <ContestCard key={it.id} kind="3s_and_ds" name={it.name} visibility={visOf(it.status)}
              meta={it.hasGame && it.gameDate
                ? <span>{formatInstant(it.gameDate, timeZone, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                : "No game yet"}
              detailHref={`${adminBase}/${it.id}`} detailLabel="Open 3s and Ds"
              deleteLabel="Delete 3s and Ds"
              onDelete={() => setToDelete({ id: it.id, name: it.name })}
              isOpen={false} onToggle={() => router.push(`${adminBase}/${it.id}`)} />
          ) : (
            <PickemRow key={it.id} it={it} adminBase={adminBase} isOpen={expanded.has(it.id)} onToggle={() => toggleRow(it.id)} onSettings={() => setSettingsFor(it)} timeZone={timeZone} />
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

      {auctionSettingsFor && (
        <AuctionSettingsModal
          slug={slug}
          orgId={orgId}
          contestId={auctionSettingsFor.id}
          onClose={() => { setAuctionSettingsFor(null); router.refresh(); }}
          onSaved={() => router.refresh()}
        />
      )}

      <PropsSettings
        open={!!propsSettingsFor}
        apiBase={`${collectionBase}/${propsSettingsFor ?? ""}`}
        timeZone={timeZone}
        onClose={() => { setPropsSettingsFor(null); router.refresh(); }}
        onSaved={() => router.refresh()}
      />

      <ConfirmModal
        open={!!toDelete}
        title="Delete this 3s and Ds?"
        message={toDelete ? `"${toDelete.name}" and all its events will be removed. This can't be undone.` : ""}
        confirmLabel="Delete"
        destructive
        onConfirm={() => void doDelete()}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}

/** One Pick'em in the list — mirrors SquaresRow: expandable (matchups preview) with
 *  a gear (quick settings) + an arrow to the full manage page. */
function PickemRow({ it, adminBase, isOpen, onToggle, onSettings, timeZone }: { it: PickemItem; adminBase: string; isOpen: boolean; onToggle: () => void; onSettings: () => void; timeZone: string }) {
  const pot = it.entryCents * it.participantCount;
  const realGames = it.games.filter((g) => !g.isTiebreaker);
  const meta = [
    it.entryCents > 0 ? `${fmtMoney(it.entryCents)} buy-in` : "no buy-in",
    it.entryCents > 0 && it.participantCount > 0 ? `${fmtMoney(pot)} pot` : null,
  ].filter(Boolean).join(", ");
  return (
    <ContestCard
      kind="pickem"
      name={it.name}
      visibility={visOf(it.status)}
      meta={meta}
      count={`${realGames.length} game${realGames.length === 1 ? "" : "s"}`}
      detailHref={`${adminBase}/${it.id}`}
      detailLabel="Open Pick'em details"
      onGear={onSettings}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <PickemPreview games={it.games} timeZone={timeZone} />
    </ContestCard>
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
  const [lockMode, setLockMode] = useState<"slate" | "per_game">(item.lockMode);
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
      body: JSON.stringify({ name: n, status, entry_cents: feeCents, collected_by: collectedBy || null, payout_splits: splits, lock_mode: lockMode }),
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
                  {placeLabel(p.place)}: {money(p.amountCents)}
                </span>
              ))}
            </div>
          )}
        </div>
        <label>
          <span style={QS_LABEL}>When do picks lock?</span>
          <select className={styles.selectInput} value={lockMode} onChange={(e) => setLockMode(e.target.value as "slate" | "per_game")}>
            <option value="slate">All picks lock when the first game starts</option>
            <option value="per_game">Each game locks at its own start time</option>
          </select>
        </label>
        {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
        <button type="button" className={styles.create} onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}

const QS_LABEL = { display: "block", fontSize: "0.8125rem", fontWeight: 600, marginBottom: 4 } as const;

/** One Squares pool in the list — expandable (game table) with a gear to edit. */
function SquaresRow({ c, adminBase, isOpen, onToggle, onEdit, timeZone }: { c: SquaresContestRow; adminBase: string; isOpen: boolean; onToggle: () => void; onEdit: () => void; timeZone: string }) {
  const cPot = c.cellCostCents * 100;
  return (
    <ContestCard
      kind="squares"
      name={c.name}
      visibility={visOf(c.status)}
      meta={`${money(c.cellCostCents)}/square, ${money(cPot)} pot`}
      count={`${c.games.length} game${c.games.length === 1 ? "" : "s"}`}
      detailHref={`${adminBase}/${c.id}`}
      detailLabel="Open pool details"
      gearLabel="Edit settings"
      onGear={onEdit}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <SquaresPreview row={c} timeZone={timeZone} />
    </ContestCard>
  );
}
