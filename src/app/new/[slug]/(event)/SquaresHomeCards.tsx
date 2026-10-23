import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { winningCell, resolvePayouts, computeGamePayoutsFromSlices } from "@/lib/v2/contests/squares";
import { buildGameAllocations } from "@/lib/v2/contests/squares-alloc";
import { getLeague } from "@/lib/v2/sports/espn";
import styles from "./SquaresHomeCards.module.css";
/* eslint-disable @next/next/no-img-element */

type TeamRef = { abbrev?: string; logo?: string; color?: string } | null;
type Live = { away: number | null; home: number | null; state: string; detail: string } | null;
type PeriodScores = Record<string, { away: number | null; home: number | null } | null> | null;
interface Game {
  id: string;
  label: string;
  league: string;
  teamRow: TeamRef; // away
  teamCol: TeamRef; // home
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
  startTime: string | null;
  live: Live;
  periodScores: PeriodScores;
  final: boolean;
}

const money = (c: number) => `$${c / 100 % 1 === 0 ? (c / 100).toFixed(0) : (c / 100).toFixed(2)}`;

function Logo({ t }: { t: TeamRef }) {
  if (t?.logo) return <img className={styles.logo} src={t.logo} alt="" width={26} height={26} />;
  return <span className={styles.logoFallback} style={{ background: t?.color ?? "var(--line)" }} />;
}

/** A score with its LAST digit emphasized — that digit is what picks the square. */
function Score({ n }: { n: number }) {
  const s = String(n);
  return (
    <span className={styles.score}>
      {s.length > 1 && <span className={styles.scoreHead}>{s.slice(0, -1)}</span>}
      <span className={styles.scoreDigit}>{s.slice(-1)}</span>
    </span>
  );
}

/** The period in play right now = the first one not yet complete in period_scores. */
function currentPeriodKey(structure: "quarters" | "halves", ps: PeriodScores): string {
  const order = structure === "quarters" ? ["Q1", "Half", "Q3", "Final"] : ["Half", "Final"];
  return order.find((k) => !ps?.[k]) ?? order[order.length - 1];
}

/** A small "this is a squares pool" marker (10x10 grid glyph + label). */
function SquaresTag() {
  return (
    <span className={styles.typeTag}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
      </svg>
      Squares
    </span>
  );
}

const startLabel = (iso: string | null): string => {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
};

/**
 * Home-page Squares cards (#230). ONE card per pool (never per game — a slate or a
 * tournament can carry many). While drafting, the card shows the member's claimed
 * count + how many squares are gone. Once numbers are locked, the card features
 * just the game that matters right now — live first, else next up, else most
 * recent final — with the member's number combos and, when the featured game is
 * live, a highlight on any combo that is currently winning (fed by the cached
 * live_score the scores cron writes). The full game list lives on the pool detail.
 */
export default async function SquaresHomeCards({ orgId, userId, slug }: { orgId: string; userId: string; slug: string }) {
  const supabase = await v2ServerClient();
  const { data: contestRows } = await supabase
    .from("v2_contests")
    .select("id, name, config")
    .eq("org_id", orgId)
    .is("event_id", null)
    .eq("contest_type", "squares");

  const active = (contestRows ?? []).filter((c) => {
    const phase = (c.config as { phase?: string } | null)?.phase;
    return phase === "primary" || phase === "secondary" || phase === "locked";
  });
  if (active.length === 0) return null;

  const ids = active.map((c) => c.id);
  const { data: cells } = await supabase.from("v2_squares_cells").select("contest_id, grid_row, grid_col, user_id").in("contest_id", ids);
  const { data: gameRows } = await supabase
    .from("v2_squares_games")
    .select("contest_id, id, label, league, team_row, team_col, row_digits, col_digits, locked_at, start_time, live_score, period_scores, game_alloc, period_alloc, status, sort_order")
    .in("contest_id", ids)
    .order("start_time", { ascending: true, nullsFirst: false })
    .order("sort_order");

  const cards: React.ReactNode[] = [];

  for (const c of active) {
    const phase = (c.config as { phase?: string }).phase;
    const myCells = (cells ?? []).filter((x) => x.contest_id === c.id && x.user_id === userId);
    const claimed = (cells ?? []).filter((x) => x.contest_id === c.id && x.user_id).length;
    const href = `/new/${slug}/contests/${c.id}`;

    if (phase === "primary" || phase === "secondary") {
      cards.push(
        <Link key={c.id} href={href} className={styles.draftCard}>
          <div className={styles.draftTop}>
            <span className={styles.name}>{c.name}</span>
            <span className={styles.badge}>Drafting</span>
          </div>
          <SquaresTag />
          <div className={styles.draftStats}>
            <span><strong>{myCells.length}</strong> yours</span>
            <span><strong>{claimed}/100</strong> gone</span>
          </div>
        </Link>,
      );
      continue;
    }

    // locked → one pool card featuring the game that matters right now.
    if (myCells.length === 0) continue;
    const games: Game[] = (gameRows ?? [])
      .filter((g) => g.contest_id === c.id && g.locked_at)
      .map((g) => ({
        id: g.id as string,
        label: (g.label as string) ?? "Game",
        league: g.league as string,
        teamRow: (g.team_row as TeamRef) ?? null,
        teamCol: (g.team_col as TeamRef) ?? null,
        rowDigits: (g.row_digits as number[]) ?? [],
        colDigits: (g.col_digits as number[]) ?? [],
        locked: !!g.locked_at,
        startTime: (g.start_time as string) ?? null,
        live: (g.live_score as Live) ?? null,
        periodScores: (g.period_scores as PeriodScores) ?? null,
        final: (g.status as string) === "final",
      }));
    if (games.length === 0) continue;

    // Win-amount math: resolve the flexible $/%/remainder allocations across ALL
    // the pool's games (remainder depends on the full series), then look up each
    // featured game's per-period dollar slice.
    const cfg = (c.config as { cell_cost_cents?: number; pot_allocation?: "equal" | "round_weighted" | "custom"; period_weights?: Record<string, Record<string, number>> }) ?? {};
    const potCents = claimed * (cfg.cell_cost_cents ?? 0);
    const allGames = (gameRows ?? []).filter((g) => g.contest_id === c.id);
    const allocGames = buildGameAllocations(
      allGames.map((g) => ({ id: g.id as string, league: g.league as string, game_alloc: g.game_alloc, period_alloc: g.period_alloc })),
      potCents,
      { potAllocation: cfg.pot_allocation ?? "equal", periodWeights: cfg.period_weights ?? {} },
    );
    const resolved = resolvePayouts(potCents, allocGames);
    const sliceCentsFor = new Map(resolved.games.map((rg) => [rg.key, new Map(rg.periods.map((p) => [p.key, p.cents]))]));

    // This member's running winnings across every scored game in the pool, and how
    // many games are still to be decided.
    const poolOwners: Record<string, string> = {};
    for (const x of cells ?? []) if (x.contest_id === c.id && x.user_id) poolOwners[`${x.grid_row},${x.grid_col}`] = x.user_id;
    const periodsByGame = new Map(resolved.games.map((rg) => [rg.key, rg.periods]));
    let myWinnings = 0;
    for (const g of games) {
      const payout = computeGamePayoutsFromSlices({ owners: poolOwners, rowDigits: g.rowDigits, colDigits: g.colDigits }, periodsByGame.get(g.id) ?? [], g.periodScores ?? {});
      myWinnings += payout.byOwner[userId] ?? 0;
    }
    const remaining = allGames.filter((g) => (g.status as string) !== "final").length;

    const liveGames = games.filter((g) => g.live?.state === "in");
    const upcoming = games.filter((g) => !g.final && g.live?.state !== "in").sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""));
    const finals = games.filter((g) => g.final).sort((a, b) => (b.startTime ?? "").localeCompare(a.startTime ?? ""));
    const featured = liveGames.length ? liveGames : upcoming.length ? [upcoming[0]] : finals.length ? [finals[0]] : [games[0]];

    cards.push(
      <Link key={c.id} href={href} className={styles.gameCard}>
        <div className={styles.poolHead}>
          <span className={styles.name}>{c.name}</span>
          <SquaresTag />
        </div>
        {featured.map((g) => {
          const win = g.live ? winningCell({ owners: {}, rowDigits: g.rowDigits, colDigits: g.colDigits }, g.live.away, g.live.home) : null;
          const isLive = g.live?.state === "in";
          const isFinal = g.final;
          // Dollar value of the square winning right now = the in-play period's slice.
          const structure = getLeague(g.league)?.periods;
          let winCents = 0;
          if ((isLive || isFinal) && (structure === "quarters" || structure === "halves")) {
            const key = currentPeriodKey(structure, g.periodScores);
            winCents = sliceCentsFor.get(g.id)?.get(key) ?? 0;
          }
          return (
            <div key={g.id} className={styles.featGame}>
              <div className={styles.matchupRow}>
                <span className={styles.matchup}>
                  <Logo t={g.teamRow} />
                  <span className={styles.abbrev}>{g.teamRow?.abbrev ?? "AWY"}</span>
                  {g.live && g.live.away != null ? <Score n={g.live.away} /> : null}
                  <span className={styles.at}>@</span>
                  {g.live && g.live.home != null ? <Score n={g.live.home} /> : null}
                  <span className={styles.abbrev}>{g.teamCol?.abbrev ?? "HOM"}</span>
                  <Logo t={g.teamCol} />
                </span>
                <span className={styles.gState} data-live={isLive || undefined} data-final={isFinal || undefined}>
                  {isLive ? g.live?.detail || "Live" : isFinal ? "Final" : startLabel(g.startTime) || "Scheduled"}
                </span>
              </div>
              <div className={styles.combos}>
                {myCells.map((cell) => {
                  const winning = !!win && win.row === cell.grid_row && win.col === cell.grid_col;
                  return (
                    <span key={`${g.id}:${cell.grid_row},${cell.grid_col}`} className={styles.combo} data-win={winning || undefined}>
                      <b>{g.rowDigits[cell.grid_row] ?? "?"}</b>-<b>{g.colDigits[cell.grid_col] ?? "?"}</b>
                      {winning && winCents > 0 && <span className={styles.winAmt}>{money(winCents)}</span>}
                    </span>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className={styles.poolFoot}>
          <span className={styles.remaining}>
            {remaining > 0 ? `${remaining} game${remaining === 1 ? "" : "s"} left` : "All games final"}
          </span>
          <span className={styles.winnings}>
            <span className={styles.winLabel}>Winnings</span>
            <span className={styles.winValue} data-zero={myWinnings === 0 || undefined}>{money(myWinnings)}</span>
          </span>
        </div>
      </Link>,
    );
  }

  if (cards.length === 0) return null;
  return <div className={styles.wrap}>{cards}</div>;
}
