-- Import legacy songs + favorites into v2, preserving ORIGINAL UUIDs so
-- song_id references (favorites) map directly. IDEMPOTENT + RE-RUNNABLE (final
-- re-import at cutover). mp3_url/art_url point at the still-public `songs` bucket,
-- so they keep working. All maps to the Golfapalooza org; event_id NULL.
-- A song's tagged_user_id is carried only when that user exists in v2_profiles
-- (else NULL — the column is ON DELETE SET NULL and optional). song_plays
-- (analytics history) are intentionally NOT imported — not needed by the player.

INSERT INTO public.v2_songs
  (id, org_id, legacy_song_id, title, mp3_url, art_url, art_thumb_url, lyrics,
   duration_seconds, tagged_user_id, sort_order, created_at, updated_at)
SELECT
  s.id, o.id, s.id, s.title, s.mp3_url, s.art_url, s.art_thumb_url, s.lyrics,
  s.duration_seconds,
  CASE WHEN EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = s.tagged_user_id)
       THEN s.tagged_user_id ELSE NULL END,
  COALESCE(s.sort_order, 0),
  COALESCE(s.created_at, now()), COALESCE(s.updated_at, now())
FROM public.songs s
CROSS JOIN (SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1) o
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.v2_song_favorites (id, user_id, song_id, created_at)
SELECT f.id, f.user_id, f.song_id, COALESCE(f.created_at, now())
FROM public.song_favorites f
WHERE EXISTS (SELECT 1 FROM public.v2_songs s WHERE s.id = f.song_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = f.user_id)
ON CONFLICT (id) DO NOTHING;
