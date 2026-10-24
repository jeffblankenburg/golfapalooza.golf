-- 00281_v2_pickem_to_slate.sql
--
-- #224: backfill the existing Pick'em slate + picks into the generic substrate
-- (v2_matchups / v2_picks). Runs alongside the code repoint that switches Pick'em's
-- reads/writes to these tables. Idempotent (ON CONFLICT DO NOTHING on the reused PKs),
-- and it REUSES the old row ids as the new PKs so every in-app reference-by-id
-- (gameId, pick keys) keeps working unchanged. The legacy v2_pickem_* tables are left
-- in place as a backup; a later cleanup migration can drop them once verified.

-- Games → matchups. away = competitor_a, home = competitor_b; favorite/winner map
-- away→'a', home→'b'; tv_channel + espn ride in external_ref; scores collapse into result.
INSERT INTO public.v2_matchups
  (id, contest_id, slot, sort_order, competitor_a, competitor_b, start_time, spread, favorite,
   external_ref, status, result, is_tiebreaker, created_at, updated_at)
SELECT
  g.id,
  g.contest_id,
  g.id::text,                                   -- slot: arbitrary but unique per contest
  g.sort_order,
  jsonb_strip_nulls(jsonb_build_object('name', g.away_team, 'abbrev', g.away_abbrev, 'logo', g.away_logo_url, 'color', g.away_color)),
  jsonb_strip_nulls(jsonb_build_object('name', g.home_team, 'abbrev', g.home_abbrev, 'logo', g.home_logo_url, 'color', g.home_color)),
  g.game_time,
  g.spread,
  CASE g.favorite WHEN 'away' THEN 'a' WHEN 'home' THEN 'b' END,
  jsonb_strip_nulls(jsonb_build_object('espn_event_id', g.espn_event_id, 'league', g.league, 'tv', g.tv_channel)),
  CASE WHEN g.away_score IS NOT NULL AND g.home_score IS NOT NULL THEN 'final' ELSE 'scheduled' END,
  CASE WHEN g.away_score IS NOT NULL AND g.home_score IS NOT NULL
       THEN jsonb_build_object('winner', CASE g.winning_team WHEN 'away' THEN 'a' WHEN 'home' THEN 'b' ELSE NULL END,
                               'score_a', g.away_score, 'score_b', g.home_score)
       ELSE NULL END,
  g.is_tiebreaker,
  g.created_at,
  g.updated_at
FROM public.v2_pickem_games g
ON CONFLICT (id) DO NOTHING;

-- Picks → picks. picked_team away→'a', home→'b' into pick.side; tiebreaker_total → tiebreaker.
INSERT INTO public.v2_picks
  (id, matchup_id, contest_id, user_id, pick, tiebreaker, created_at, updated_at)
SELECT
  p.id,
  p.game_id,
  g.contest_id,
  p.user_id,
  CASE WHEN p.picked_team IN ('away', 'home')
       THEN jsonb_build_object('side', CASE p.picked_team WHEN 'away' THEN 'a' WHEN 'home' THEN 'b' END)
       ELSE NULL END,
  p.tiebreaker_total,
  p.created_at,
  p.updated_at
FROM public.v2_pickem_picks p
JOIN public.v2_pickem_games g ON g.id = p.game_id
ON CONFLICT (id) DO NOTHING;
