import Link from "next/link";
import { v2ServerClient } from "@/lib/v2/supabase";
import { fetchGameScore } from "@/lib/v2/sports/espn";
/* eslint-disable @next/next/no-img-element */

interface Competitor {
  name?: string;
  abbrev?: string | null;
  logo?: string | null;
  color?: string | null;
}

/**
 * Home-page "3s and Ds" cards — one per active activity with a live/upcoming game,
 * styled like the other contest cards: team logos + score + a LIVE button to the
 * board. Auto-hides once ESPN marks the game final.
 */
export default async function ThreesHomeCards({ orgId, slug, eventId }: { orgId: string; slug: string; eventId: string | null }) {
  const supabase = await v2ServerClient();
  let query = supabase
    .from("v2_contests")
    .select("id, name, event_id")
    .eq("org_id", orgId)
    .eq("contest_type", "3s_and_ds")
    .eq("status", "active");
  query = eventId ? query.or(`event_id.is.null,event_id.eq.${eventId}`) : query.is("event_id", null);
  const { data: contests } = await query;
  if (!contests?.length) return null;

  const ids = contests.map((c) => c.id);
  const { data: matchups } = await supabase
    .from("v2_matchups")
    .select("contest_id, competitor_a, competitor_b, external_ref")
    .in("contest_id", ids);
  const byContest = new Map((matchups ?? []).map((m) => [m.contest_id as string, m]));

  const withGame = contests.filter((c) => byContest.has(c.id));
  const cards = await Promise.all(
    withGame.map(async (c) => {
      const m = byContest.get(c.id)!;
      const ext = (m.external_ref as Record<string, unknown> | null) ?? null;
      const league = (ext?.league as string) ?? null;
      const espnId = (ext?.espn_event_id as string) ?? null;
      const score = league && espnId ? await fetchGameScore(league, espnId).catch(() => null) : null;
      // Auto-remove once the game is final.
      if (score && score.state === "post") return null;
      return {
        id: c.id,
        a: (m.competitor_a as Competitor | null) ?? {},
        b: (m.competitor_b as Competitor | null) ?? {},
        live: score?.state === "in",
        aScore: score?.away?.current ?? null,
        bScore: score?.home?.current ?? null,
        clock: score?.state === "in" ? score.detail : null,
      };
    }),
  );
  const shown = cards.filter((c): c is NonNullable<typeof c> => c !== null);
  if (shown.length === 0) return null;

  const logo = { width: 26, height: 26, objectFit: "contain" as const, flex: "0 0 auto" as const };

  return (
    <>
      {shown.map((c) => (
        <Link
          key={c.id}
          href={`/new/${slug}/threes/${c.id}`}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "14px 16px",
            border: "1px solid var(--line)",
            borderRadius: 14,
            background: "var(--paper)",
            textDecoration: "none",
            color: "var(--ink)",
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 7, flex: 1, minWidth: 0 }}>
            {c.a.logo && <img src={c.a.logo} alt="" style={logo} />}
            <b>{c.a.abbrev || c.a.name || "Away"}</b>
            {c.live ? (
              <span style={{ fontWeight: 800 }}>{c.aScore ?? 0}</span>
            ) : null}
            <span style={{ opacity: 0.5 }}>{c.live ? "–" : "vs"}</span>
            {c.live ? (
              <span style={{ fontWeight: 800 }}>{c.bScore ?? 0}</span>
            ) : null}
            <b>{c.b.abbrev || c.b.name || "Home"}</b>
            {c.b.logo && <img src={c.b.logo} alt="" style={logo} />}
          </span>
          {c.clock && (
            <span style={{ fontSize: "0.76rem", color: "var(--ink-soft)", whiteSpace: "nowrap" }}>{c.clock}</span>
          )}
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              padding: "6px 13px",
              borderRadius: 999,
              background: c.live ? "#e11d48" : "var(--brand)",
              color: "#fff",
              fontWeight: 800,
              fontSize: "0.8rem",
              whiteSpace: "nowrap",
            }}
          >
            {c.live && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
            {c.live ? "LIVE" : "Watch"}
          </span>
        </Link>
      ))}
    </>
  );
}
