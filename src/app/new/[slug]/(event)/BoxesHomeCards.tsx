import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import styles from "./BoxesHomeCards.module.css";
/* eslint-disable @next/next/no-img-element */

type TeamRef = { abbrev?: string; logo?: string; color?: string } | null;
interface Game {
  id: string;
  label: string;
  teamRow: TeamRef; // away
  teamCol: TeamRef; // home
  rowDigits: number[];
  colDigits: number[];
  locked: boolean;
}

function Logo({ t }: { t: TeamRef }) {
  if (t?.logo) return <img className={styles.logo} src={t.logo} alt="" width={26} height={26} />;
  return <span className={styles.logoFallback} style={{ background: t?.color ?? "var(--line)" }} />;
}

/**
 * Home-page Boxes cards (#230). While a pool is drafting, a draft card shows the
 * member's claimed count + how many squares are gone. Once numbers are locked, a
 * card per game shows the matchup logos + the member's own number combinations
 * (their squares' away/home digits). The live current-winner highlight comes with
 * ESPN grading; this is the at-a-glance surface that links into the pool.
 */
export default async function BoxesHomeCards({ orgId, userId, slug }: { orgId: string; userId: string; slug: string }) {
  const supabase = await v2ServerClient();
  const { data: contestRows } = await supabase
    .from("v2_contests")
    .select("id, name, config")
    .eq("org_id", orgId)
    .is("event_id", null)
    .eq("contest_type", "boxes");

  const active = (contestRows ?? []).filter((c) => {
    const phase = (c.config as { phase?: string } | null)?.phase;
    return phase === "primary" || phase === "secondary" || phase === "locked";
  });
  if (active.length === 0) return null;

  const ids = active.map((c) => c.id);
  const { data: cells } = await supabase.from("v2_boxes_cells").select("contest_id, grid_row, grid_col, user_id").in("contest_id", ids);
  const { data: gameRows } = await supabase
    .from("v2_boxes_games")
    .select("contest_id, id, label, team_row, team_col, row_digits, col_digits, locked_at, sort_order")
    .in("contest_id", ids)
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
          <div className={styles.draftStats}>
            <span><strong>{myCells.length}</strong> yours</span>
            <span><strong>{claimed}/100</strong> gone</span>
          </div>
        </Link>,
      );
      continue;
    }

    // locked → a card per game with the member's number combos
    if (myCells.length === 0) continue;
    const games: Game[] = (gameRows ?? [])
      .filter((g) => g.contest_id === c.id)
      .map((g) => ({
        id: g.id as string,
        label: (g.label as string) ?? "Game",
        teamRow: (g.team_row as TeamRef) ?? null,
        teamCol: (g.team_col as TeamRef) ?? null,
        rowDigits: (g.row_digits as number[]) ?? [],
        colDigits: (g.col_digits as number[]) ?? [],
        locked: !!g.locked_at,
      }));
    for (const g of games) {
      if (!g.locked) continue;
      cards.push(
        <Link key={`${c.id}:${g.id}`} href={href} className={styles.gameCard}>
          <div className={styles.matchup}>
            <Logo t={g.teamRow} />
            <span className={styles.abbrev}>{g.teamRow?.abbrev ?? "AWY"}</span>
            <span className={styles.at}>@</span>
            <Logo t={g.teamCol} />
            <span className={styles.abbrev}>{g.teamCol?.abbrev ?? "HOM"}</span>
          </div>
          <div className={styles.combos}>
            {myCells.map((cell) => (
              <span key={`${cell.grid_row},${cell.grid_col}`} className={styles.combo}>
                {g.teamRow?.abbrev ?? "A"} <b>{g.rowDigits[cell.grid_row] ?? "?"}</b> · {g.teamCol?.abbrev ?? "H"} <b>{g.colDigits[cell.grid_col] ?? "?"}</b>
              </span>
            ))}
          </div>
        </Link>,
      );
    }
  }

  if (cards.length === 0) return null;
  return <div className={styles.wrap}>{cards}</div>;
}
