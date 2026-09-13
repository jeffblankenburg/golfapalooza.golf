-- Import the existing legacy walk-up config (play order + per-Loozer song choice
-- + start offset) into v2 so the ported announcer isn't blank. Legacy walkup_entries
-- are per-trip; v2 is per-org (one active walk-up list), so we take each Loozer's
-- MOST RECENT entry across trips. song_id maps directly (v2_songs preserved the
-- legacy IDs in 00201). Idempotent/re-runnable.

INSERT INTO public.v2_walkup_entries (org_id, user_id, song_id, start_seconds, sort_order)
SELECT
  o.id,
  w.user_id,
  CASE WHEN EXISTS (SELECT 1 FROM public.v2_songs s WHERE s.id = w.song_id) THEN w.song_id ELSE NULL END,
  COALESCE(w.start_seconds, 0),
  w.sort_order
FROM (
  SELECT DISTINCT ON (user_id) user_id, song_id, start_seconds, sort_order, updated_at
  FROM public.walkup_entries
  ORDER BY user_id, updated_at DESC
) w
CROSS JOIN (SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1) o
WHERE EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = w.user_id)
ON CONFLICT (org_id, user_id) DO NOTHING;
