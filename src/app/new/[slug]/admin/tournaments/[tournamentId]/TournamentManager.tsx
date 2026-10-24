"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import type { TournamentTeam, TournamentGame } from "@/lib/v2/contests/tournament";
import type { TournamentRow } from "@/lib/v2/contests/tournament-server";

const ROUND_LABEL: Record<number, string> = { 0: "First Four", 1: "Round 1", 2: "Round 2", 3: "Sweet 16", 4: "Elite 8", 5: "Final Four", 6: "Championship" };

/** Parse pasted field lines: "seed, region, name" (comma or tab). */
function parseField(text: string): { seed: number; region: string; name: string }[] {
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const parts = line.split(/[\t,]/).map((p) => p.trim());
    const seed = parseInt(parts[0], 10);
    return { seed: Number.isFinite(seed) ? seed : 0, region: parts[1] || "", name: parts.slice(2).join(", ") || parts[1] || "" };
  }).filter((t) => t.seed >= 1 && t.region && t.name);
}

export default function TournamentManager({
  orgId, slug, tournament, teams, games, champion, runnerUp, canImportEspn,
}: {
  orgId: string; slug: string; tournament: TournamentRow;
  teams: TournamentTeam[]; games: TournamentGame[]; champion: string | null; runnerUp: string | null; canImportEspn: boolean;
}) {
  const router = useRouter();
  const base = `/api/v2/orgs/${orgId}/tournaments/${tournament.id}`;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importDate, setImportDate] = useState("");
  const [fieldText, setFieldText] = useState(
    teams.map((t) => `${t.seed}, ${t.region ?? ""}, ${t.name}`).join("\n"),
  );
  // Re-seed the editor when the stored field actually changes (after import / save),
  // keyed on the team ids so local typing isn't clobbered on every re-render.
  const teamSig = teams.map((t) => t.id).join(",");
  useEffect(() => {
    setFieldText(teams.map((t) => `${t.seed}, ${t.region ?? ""}, ${t.name}`).join("\n"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSig]);

  async function importEspn() {
    if (!importDate) { setErr("Pick the Round 1 start date"); return; }
    const d = new Date(importDate + "T12:00:00");
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const ymd = (x: Date) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
    await act({ action: "import_espn", dates: [ymd(d), ymd(next)] });
  }

  const parsed = useMemo(() => parseField(fieldText), [fieldText]);
  const regions = useMemo(() => [...new Set(parsed.map((t) => t.region))], [parsed]);
  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const generated = games.length > 0;

  async function act(body: Record<string, unknown>): Promise<boolean> {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${base}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) { setErr(d.error || "Something went wrong."); setBusy(false); return false; }
      router.refresh();
      setBusy(false);
      return true;
    } catch { setErr("Something went wrong."); setBusy(false); return false; }
  }

  const name = (id: string | null) => (id ? teamById.get(id)?.name ?? "?" : "");
  const seedOf = (id: string | null) => (id ? teamById.get(id)?.seed ?? null : null);

  // Group games by round, then region (rounds 1–4).
  const byRound = new Map<number, TournamentGame[]>();
  for (const g of games) (byRound.get(g.round) || byRound.set(g.round, []).get(g.round)!).push(g);
  const rounds = [...byRound.keys()].sort((a, b) => a - b);

  return (
    <div className={styles.page}>
      <Link href={`/new/${slug}/admin/tournaments`} className={styles.back}>← Tournaments</Link>
      <div className={styles.titleRow}><h1 className={styles.title}>{tournament.name}</h1></div>
      <p className={styles.lede} style={{ marginTop: 2, color: "var(--ink-soft)" }}>
        {tournament.sport}{tournament.season ? `, ${tournament.season}` : ""}, {tournament.status}
      </p>

      {champion && (
        <p className={styles.lede} style={{ marginTop: 8 }}>
          <strong style={{ color: "var(--brand)" }}>Champion: {name(champion)}</strong>{runnerUp ? `, runner-up ${name(runnerUp)}` : ""}
        </p>
      )}

      {!generated ? (
        <div style={{ marginTop: 16 }}>
          {canImportEspn && (
            <div style={{ marginBottom: 18, padding: 12, border: "1px solid var(--line)", borderRadius: 10 }}>
              <p className={styles.sectionLabel} style={{ marginTop: 0 }}>Import field from ESPN</p>
              <p className={styles.roundFormHint} style={{ marginTop: 0 }}>Pulls the 64-team seeded field from the tournament&apos;s Round 1 games. Pick the Round 1 start date (the Thursday), then review + edit below before generating.</p>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                <label><span style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>Round 1 start date</span>
                  <input className={styles.input} type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
                </label>
                <button type="button" className={styles.createBtnGhost} disabled={busy || !importDate} onClick={() => void importEspn()}>
                  {busy ? "Importing…" : "Import from ESPN"}
                </button>
              </div>
            </div>
          )}
          <p className={styles.sectionLabel}>Seeded field</p>
          <p className={styles.roundFormHint} style={{ marginTop: 0 }}>
            One team per line: <code>seed, region, name</code> (comma or tab). 4 regions × 16 seeds for a standard bracket. Import above to auto-fill, or paste by hand.
          </p>
          <textarea
            className={styles.input}
            style={{ width: "100%", minHeight: 220, fontFamily: "monospace", fontSize: "0.8rem" }}
            value={fieldText}
            onChange={(e) => setFieldText(e.target.value)}
            placeholder={"1, East, Houston\n16, East, SIU Edwardsville\n8, East, ..."}
          />
          <p className={styles.roundFormHint} style={{ marginTop: 6 }}>
            {parsed.length} teams, {regions.length} region{regions.length === 1 ? "" : "s"}{regions.length ? ` (${regions.join(", ")})` : ""}
          </p>
          {err && <p className={styles.err} style={{ margin: "6px 0 0" }}>{err}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <button type="button" className={styles.createBtnGhost} disabled={busy || parsed.length === 0}
              onClick={() => void act({ action: "set_field", teams: parsed })}>Save field</button>
            <button type="button" className={styles.create} disabled={busy || regions.length !== 4 || teams.length === 0}
              onClick={() => void act({ action: "generate" })} title={regions.length !== 4 ? "Need exactly 4 regions" : teams.length === 0 ? "Save the field first" : ""}>
              Generate bracket
            </button>
          </div>
        </div>
      ) : (
        <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 18 }}>
          {err && <p className={styles.err} style={{ margin: 0 }}>{err}</p>}
          {rounds.map((round) => (
            <div key={round}>
              <p className={styles.sectionLabel}>{ROUND_LABEL[round] ?? `Round ${round}`}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {byRound.get(round)!.map((g) => {
                  const bothSet = g.team_a_id && g.team_b_id;
                  const final = g.status === "final" && g.result?.winner_team_id;
                  const winner = g.result?.winner_team_id ?? null;
                  const side = (id: string | null) => (
                    <span style={{ fontWeight: winner === id ? 800 : 500, color: winner === id ? "var(--brand)" : "var(--ink)" }}>
                      {id ? `(${seedOf(id)}) ${name(id)}` : "TBD"}
                    </span>
                  );
                  return (
                    <div key={g.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", border: "1px solid var(--line)", borderRadius: 10 }}>
                      <span style={{ flex: 1, minWidth: 0, fontSize: "0.85rem" }}>
                        {g.region ? <span style={{ color: "var(--ink-soft)", fontSize: "0.72rem", marginRight: 6 }}>{g.region}</span> : null}
                        {side(g.team_a_id)} <span style={{ color: "var(--ink-soft)" }}>vs</span> {side(g.team_b_id)}
                      </span>
                      {!final && bothSet && (
                        <span style={{ display: "inline-flex", gap: 6 }}>
                          <button type="button" className={styles.createBtnGhost} style={{ padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy}
                            onClick={() => void act({ action: "set_result", gameId: g.id, winnerTeamId: g.team_a_id })}>{name(g.team_a_id)} wins</button>
                          <button type="button" className={styles.createBtnGhost} style={{ padding: "4px 10px", fontSize: "0.78rem" }} disabled={busy}
                            onClick={() => void act({ action: "set_result", gameId: g.id, winnerTeamId: g.team_b_id })}>{name(g.team_b_id)} wins</button>
                        </span>
                      )}
                      {final && <span style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--brand)" }}>FINAL</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
