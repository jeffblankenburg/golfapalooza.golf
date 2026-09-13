-- Back-import legacy listening history into v2, so v2 play counts reflect all-time
-- history (00201 imported songs + favorites but intentionally skipped plays).
-- IDs are preserved and the migration is idempotent/re-runnable (safe to run
-- again at cutover). A play is carried only when BOTH its song exists in v2_songs
-- (imported in 00201, same UUIDs) and its user exists in v2_profiles.

INSERT INTO public.v2_song_plays (id, user_id, song_id, played_at)
SELECT sp.id, sp.user_id, sp.song_id, COALESCE(sp.played_at, now())
FROM public.song_plays sp
WHERE EXISTS (SELECT 1 FROM public.v2_songs s WHERE s.id = sp.song_id)
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = sp.user_id)
ON CONFLICT (id) DO NOTHING;
