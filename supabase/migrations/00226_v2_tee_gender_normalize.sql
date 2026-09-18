-- 00226_v2_tee_gender_normalize.sql
-- Make tee gender a first-class attribute instead of something smuggled into the
-- tee name. Historically a course's forward (women's) set was disambiguated from
-- the men's set of the same color by suffixing the NAME — "Red" (men) vs
-- "Red (women)" — because the table only allowed one row per (course_id,
-- tee_name). This:
--   1. Relaxes uniqueness to (course_id, tee_name, gender) so "Red" can exist
--      once for men and once for women as distinct native rows.
--   2. Backfills gender from any lingering name suffix ("(women)", "(ladies)",
--      "(men)", etc.). Most rows already carry the right gender from the legacy
--      import; this is the idempotent safety net.
--   3. Strips the now-redundant suffix from the display name.
-- Verified against live data: all 94 suffixed tees are women's and every one
-- collides cross-gender with a men's tee of the same base name (hence step 1);
-- 0 duplicates remain under the new (course_id, tee_name, gender) key.

BEGIN;

-- 1) Drop whatever UNIQUE constraint currently covers exactly (course_id, tee_name).
--    (Auto-named v2_course_tees_course_id_tee_name_key, but discover it defensively.)
DO $$
DECLARE
  con_name TEXT;
BEGIN
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'public.v2_course_tees'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::text ORDER BY a.attname::text)
      FROM unnest(c.conkey) k
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k
    ) = ARRAY['course_id', 'tee_name']
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.v2_course_tees DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

-- 2) Backfill gender from any remaining name suffix (idempotent).
UPDATE public.v2_course_tees
   SET gender = 'women'
 WHERE gender IS DISTINCT FROM 'women'
   AND tee_name ~* '\((wom[ae]n|ladies|lady|w)\)\s*$';

UPDATE public.v2_course_tees
   SET gender = 'men'
 WHERE gender = 'all'
   AND tee_name ~* '\((men|mens|m)\)\s*$';

-- 3) Strip the redundant gender suffix from the display name.
UPDATE public.v2_course_tees
   SET tee_name = btrim(regexp_replace(
         tee_name,
         '\s*\((wom[ae]n|ladies|lady|w|men|mens|m)\)\s*$',
         '',
         'i'))
 WHERE tee_name ~* '\((wom[ae]n|ladies|lady|w|men|mens|m)\)\s*$';

-- 4) Re-establish uniqueness, now gender-aware.
ALTER TABLE public.v2_course_tees
  ADD CONSTRAINT v2_course_tees_course_name_gender_key UNIQUE (course_id, tee_name, gender);

COMMIT;
