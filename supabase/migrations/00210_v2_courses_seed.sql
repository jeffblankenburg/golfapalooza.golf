-- Seed the universal v2 course library from the original courses tables, once.
-- Id-preserving so FKs line up; idempotent (ON CONFLICT DO NOTHING) so it's safe
-- to re-run and won't clobber v2-side edits. Attribution user columns
-- (created_by/updated_by/verified_by) are left NULL — the original values point
-- at users rows that may not have a v2_profiles row, and seeded library data
-- doesn't need historical attribution. New v2 edits stamp real v2 users.
-- Order matters: courses -> tees -> holes so foreign keys resolve.

INSERT INTO public.v2_courses
  (id, external_id, name, club_name, address, city, state, country, postal_code,
   phone, website, latitude, longitude, hole_count, source, verified, verified_at,
   lookup_key, created_at, updated_at)
SELECT
  id, external_id, name, club_name, address, city, state, country, postal_code,
  phone, website, latitude, longitude, hole_count, source, verified, verified_at,
  lookup_key, created_at, updated_at
FROM public.courses
ON CONFLICT (id) DO NOTHING;

-- The original tolerates the odd duplicate (course_id, tee_name); v2 enforces it
-- UNIQUE. Disambiguate collisions with a numeric suffix ("Red" → "Red 2") so the
-- copy fits the constraint (ids + hole FKs are unchanged).
INSERT INTO public.v2_course_tees
  (id, course_id, tee_name, tee_color, gender, course_rating, slope_rating,
   front_nine_rating, front_nine_slope, back_nine_rating, back_nine_slope,
   total_yards, total_meters, par, confidence, created_at, updated_at)
SELECT
  id, course_id,
  CASE WHEN rn = 1 THEN tee_name ELSE tee_name || ' ' || rn END AS tee_name,
  tee_color, gender, course_rating, slope_rating,
  front_nine_rating, front_nine_slope, back_nine_rating, back_nine_slope,
  total_yards, total_meters, par, confidence, created_at, updated_at
FROM (
  SELECT *, ROW_NUMBER() OVER (
    PARTITION BY course_id, lower(tee_name) ORDER BY created_at, id
  ) AS rn
  FROM public.course_tees
) t
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.v2_course_holes
  (id, course_id, tee_id, hole_number, par, handicap_index, yards, meters,
   hole_name, overhead_image_url, green_image_url,
   tee_latitude, tee_longitude, green_latitude, green_longitude,
   green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude,
   drive_latitude, drive_longitude, center_line, created_at)
SELECT
  id, course_id, tee_id, hole_number, par, handicap_index, yards, meters,
  hole_name, overhead_image_url, green_image_url,
  tee_latitude, tee_longitude, green_latitude, green_longitude,
  green_front_latitude, green_front_longitude, green_back_latitude, green_back_longitude,
  drive_latitude, drive_longitude, center_line, created_at
FROM public.course_holes
ON CONFLICT (id) DO NOTHING;
