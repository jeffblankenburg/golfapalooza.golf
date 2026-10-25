"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/app/new/new.module.css";
import { ROUND1_MATCHUPS, type TournamentTeam } from "@/lib/v2/contests/tournament";
import type { TournamentRow } from "@/lib/v2/contests/tournament-server";

/** One team's chip inside a region: logo, (seed) name, record. Dims an eliminated team. */
function TeamChip({ team }: { team: TournamentTeam | null }) {
  if (!team) return <span style={{ fontSize: "0.74rem", color: "var(--ink-soft)", paddingLeft: 19 }}>TBD</span>;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, opacity: team.eliminated ? 0.45 : 1 }}>
      <span style={{ fontSize: "0.66rem", fontWeight: 800, color: "var(--ink-soft)", width: 14, textAlign: "right", flexShrink: 0 }}>{team.seed}</span>
      {team.logo_url
        ? <img src={team.logo_url} alt="" width={16} height={16} style={{ flexShrink: 0, objectFit: "contain" }} />
        : <span style={{ width: 16, height: 16, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: "0.76rem", textDecoration: team.eliminated ? "line-through" : "none" }}>{team.name}</span>
      {team.record && <span style={{ fontSize: "0.64rem", color: "var(--ink-soft)", flexShrink: 0 }}>{team.record}</span>}
    </span>
  );
}

/** One R1 side: a single team, or a First Four pair (two same-seed teams) when the slot
 *  is still contested by a play-in. */
function SlotSide({ teams }: { teams: TournamentTeam[] }) {
  if (teams.length <= 1) return <TeamChip team={teams[0] ?? null} />;
  return (
    <span style={{ display: "flex", flexDirection: "column", gap: 2, borderLeft: "2px solid var(--brand)", paddingLeft: 5 }}>
      <span style={{ fontSize: "0.55rem", fontWeight: 800, letterSpacing: 0.3, textTransform: "uppercase", color: "var(--brand)" }}>First Four</span>
      {teams.map((t) => <TeamChip key={t.id} team={t} />)}
    </span>
  );
}

/** A single region: its name + the 8 first-round matchups (seed order). A contested slot
 *  (play-in) shows both teams until the First Four game is decided. Sized to sit two-up in
 *  a 400px column. */
function RegionCard({ region, teamsAt }: { region: string; teamsAt: (region: string, seed: number) => TournamentTeam[] }) {
  return (
    <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden", background: "var(--card)", minWidth: 0 }}>
      <div style={{ padding: "5px 9px", borderBottom: "1px solid var(--line)", fontWeight: 800, fontSize: "0.78rem", background: "var(--surface-2, var(--card))" }}>{region}</div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {ROUND1_MATCHUPS.map(([a, b], i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 3, padding: "5px 9px", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
            <SlotSide teams={teamsAt(region, a)} />
            <SlotSide teams={teamsAt(region, b)} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function TournamentManager({
  orgId, slug, tournament, teams, champion, runnerUp, canImportEspn,
}: {
  orgId: string; slug: string; tournament: TournamentRow;
  teams: TournamentTeam[]; champion: string | null; runnerUp: string | null; canImportEspn: boolean;
}) {
  const router = useRouter();
  const base = `/api/v2/orgs/${orgId}/tournaments/${tournament.id}`;
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [importDate, setImportDate] = useState("");

  const teamById = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  // Multimap: a contested seed (First Four) has two teams at one region:seed.
  const teamsByRegionSeed = useMemo(() => {
    const m = new Map<string, TournamentTeam[]>();
    for (const t of teams) { const k = `${t.region}:${t.seed}`; (m.get(k) ?? m.set(k, []).get(k)!).push(t); }
    return m;
  }, [teams]);
  const teamsAt = (region: string, seed: number) => teamsByRegionSeed.get(`${region}:${seed}`) ?? [];

  // Region arrangement (bracket order): the stored config.regions when it covers the field,
  // else the field's own region set. Drives the Final Four pairing + the card layout.
  const regionOrder = useMemo(() => {
    const field = [...new Set(teams.map((t) => t.region).filter((r): r is string => !!r))];
    const stored = (tournament.config as { regions?: unknown } | null)?.regions;
    const cfg = Array.isArray(stored) ? stored.filter((r): r is string => typeof r === "string") : [];
    return cfg.length === 4 && cfg.every((r) => field.includes(r)) ? cfg : field;
  }, [teams, tournament.config]);

  const fourRegions = regionOrder.length === 4;
  // The two Final Four pairings: regions[0]&[1] meet, and [2]&[3] meet.
  const semis = fourRegions ? [[regionOrder[0], regionOrder[1]], [regionOrder[2], regionOrder[3]]] : [];

  async function act(body: Record<string, unknown>): Promise<boolean> {
    if (busy) return false;
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

  async function importEspn() {
    if (!importDate) { setErr("Pick the Round 1 start date"); return; }
    const d = new Date(importDate + "T12:00:00");
    const next = new Date(d); next.setDate(d.getDate() + 1);
    const ymd = (x: Date) => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}`;
    await act({ action: "import_espn", dates: [ymd(d), ymd(next)] });
  }

  const name = (id: string | null) => (id ? teamById.get(id)?.name ?? "?" : "");

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

      {/* Import — the one action; it pulls the field and builds the bracket in one go. */}
      {canImportEspn && (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid var(--line)", borderRadius: 12 }}>
          <p className={styles.sectionLabel} style={{ marginTop: 0 }}>{teams.length ? "Re-import field from ESPN" : "Import field from ESPN"}</p>
          <p className={styles.roundFormHint} style={{ marginTop: 0 }}>
            Pick the Round 1 start date (the Thursday). We pull the full seeded field, each team&apos;s record, the First Four play-ins, and the region arrangement that sets the Final Four pairing, then build the bracket.
          </p>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <label><span style={{ display: "block", fontSize: "0.78rem", fontWeight: 600, marginBottom: 4 }}>Round 1 start date</span>
              <input className={styles.input} type="date" value={importDate} onChange={(e) => setImportDate(e.target.value)} />
            </label>
            <button type="button" className={styles.createBtnGhost} disabled={busy || !importDate} onClick={() => void importEspn()}>
              {busy ? "Importing…" : teams.length ? "Re-import" : "Import from ESPN"}
            </button>
          </div>
        </div>
      )}

      {err && <p className={styles.err} style={{ margin: "10px 0 0" }}>{err}</p>}

      {/* The field, by region. Each Final Four pairing is a row of two narrow columns. */}
      {teams.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <p className={styles.sectionLabel} style={{ margin: 0 }}>The field ({teams.length} teams, {regionOrder.length} region{regionOrder.length === 1 ? "" : "s"})</p>

          {fourRegions ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 10 }}>
              {semis.map((pair, i) => (
                <div key={i}>
                  <p className={styles.roundFormHint} style={{ margin: "0 0 6px", fontWeight: 700 }}>{pair[0]} vs {pair[1]}</p>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    {pair.map((r) => <RegionCard key={r} region={r} teamsAt={teamsAt} />)}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p className={styles.roundFormHint} style={{ marginTop: 8 }}>A standard bracket needs exactly 4 regions. Import from ESPN above.</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10 }}>
                {regionOrder.map((r) => <RegionCard key={r} region={r} teamsAt={teamsAt} />)}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
