import { redirect } from "next/navigation";
import { getPlatformContext } from "@/lib/v2/context";
import { v2ServerClient } from "@/lib/v2/supabase";
import { v2Now } from "@/lib/v2/simulator";
import { orgNameMode } from "@/lib/v2/orgs";
import { pickName } from "@/lib/v2/profile";
import { rankPickem, isSlateLocked, type PickemGame, type PickemPick } from "@/lib/v2/contests/pickem";
import PickemContent, { type LeaderEntry } from "./PickemContent";
import styles from "@/app/new/new.module.css";

const GAME_SELECT = "id, away_team, home_team, away_logo_url, home_logo_url, away_color, home_color, spread, favorite, game_time, tv_channel, is_tiebreaker, winning_team, away_score, home_score, sort_order";

/** Member Pick'em (#209) — pick games against the spread + a tiebreaker. */
export default async function PickemPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ctx = await getPlatformContext();
  if (!ctx) redirect("/new/signup");
  const org = ctx.orgs.find((o) => o.slug === slug);
  if (!org) redirect("/new");

  const supabase = await v2ServerClient();
  const { data: ev } = await supabase
    .from("v2_events").select("id").eq("org_id", org.id).eq("status", "active").order("start_date", { ascending: false }).limit(1).maybeSingle();
  if (!ev) redirect(`/new/${slug}`);

  const { data: contest } = await supabase
    .from("v2_contests").select("id, name, status")
    .eq("event_id", ev.id).eq("contest_type", "pickem").eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (!contest) {
    return (
      <div className={`${styles.page} ${styles.orgPage}`}>
        <h1 className={styles.title}>Pick&apos;em</h1>
        <p className={styles.dnsHint} style={{ marginTop: 18 }}>The picks aren&apos;t open yet. Check back soon.</p>
      </div>
    );
  }

  const { data: gameRows } = await supabase.from("v2_pickem_games").select(GAME_SELECT).eq("contest_id", contest.id).order("sort_order").order("game_time");
  const games = (gameRows || []) as PickemGame[];
  const gameIds = games.map((g) => g.id);
  const { data: pickRows } = gameIds.length
    ? await supabase.from("v2_pickem_picks").select("game_id, user_id, picked_team, tiebreaker_total").in("game_id", gameIds)
    : { data: [] as PickemPick[] };
  const picks = (pickRows || []) as PickemPick[];

  const locked = isSlateLocked(games, await v2Now());
  const ranked = rankPickem(games, picks);

  const userIds = [...new Set(picks.map((p) => p.user_id))];
  const [{ data: profs }, mode] = await Promise.all([
    userIds.length ? supabase.from("v2_profiles").select("id, display_name, first_name, last_name, avatar_url").in("id", userIds) : Promise.resolve({ data: [] as { id: string; display_name: string | null; first_name: string | null; last_name: string | null; avatar_url: string | null }[] }),
    orgNameMode(supabase, org.id),
  ]);
  const prof = new Map((profs || []).map((p) => [p.id as string, p]));

  // Only reveal individual picks once the slate is locked (no early peeking).
  const picksByUser = new Map<string, PickemPick[]>();
  if (locked) for (const p of picks) (picksByUser.get(p.user_id) || picksByUser.set(p.user_id, []).get(p.user_id)!).push(p);

  const leaderboard: LeaderEntry[] = ranked.map((r) => ({
    userId: r.userId,
    name: prof.has(r.userId) ? pickName(prof.get(r.userId)!, mode) : "Member",
    avatarUrl: (prof.get(r.userId)?.avatar_url as string | null) ?? null,
    correct: r.correct,
    decided: r.decided,
    pickedCount: r.pickedCount,
    tiebreakerTotal: r.tiebreakerTotal,
    tiebreakerDiff: r.tiebreakerDiff,
    rank: r.rank,
    picks: locked ? (picksByUser.get(r.userId) || []).map((p) => ({ gameId: p.game_id, pickedTeam: p.picked_team })) : null,
  }));

  const myPicks: Record<string, { picked: "away" | "home" | null; tiebreaker: number | null }> = {};
  for (const p of picks) if (p.user_id === ctx.userId) myPicks[p.game_id] = { picked: p.picked_team, tiebreaker: p.tiebreaker_total };

  return (
    <div className={`${styles.page} ${styles.orgPage}`}>
      <h1 className={styles.title}>{contest.name || "Pick'em"}</h1>
      <PickemContent
        eventId={ev.id as string}
        games={games}
        initialPicks={myPicks}
        leaderboard={leaderboard}
        locked={locked}
        meId={ctx.userId}
        totalGames={games.length}
      />
    </div>
  );
}
