-- User ETL: migrate every legacy user profile into v2_profiles.
-- Same id space (users.id = auth.users.id = v2_profiles.id), so this is a direct
-- copy. Only auth-backed, non-system users are eligible (v2_profiles.id is FK'd
-- to auth.users). Field mapping:
--   display_name ← legacy display_name (the shown handle), fallback full_name
--   first/last   ← split of full_name (last only when a space exists)
--   nickname     ← legacy display_name, but only when it differs from full_name
--                  (so displayNameFrom() surfaces the handle; else "First Last")
--   birthdate    ← legacy birthday;  avatar_url/phone copied as-is
--   zip          ← no legacy source, left NULL
--
-- Idempotent: inserts profiles that don't exist yet and ENRICHES NULL fields on
-- any that already exist (e.g. the org creator's self-provisioned row) without
-- clobbering values a user already set in v2. Re-runnable.

INSERT INTO public.v2_profiles
  (id, display_name, avatar_url, phone, first_name, last_name, nickname,
   birthdate, created_at, updated_at)
SELECT
  u.id,
  COALESCE(NULLIF(TRIM(u.display_name), ''), NULLIF(TRIM(u.full_name), ''), 'Member'),
  u.avatar_url,
  u.phone,
  NULLIF(split_part(TRIM(COALESCE(u.full_name, '')), ' ', 1), ''),
  CASE
    WHEN POSITION(' ' IN TRIM(COALESCE(u.full_name, ''))) > 0
    THEN NULLIF(TRIM(SUBSTRING(TRIM(u.full_name) FROM POSITION(' ' IN TRIM(u.full_name)) + 1)), '')
    ELSE NULL
  END,
  CASE
    WHEN NULLIF(TRIM(u.display_name), '') IS NOT NULL
     AND TRIM(u.display_name) <> TRIM(COALESCE(u.full_name, ''))
    THEN TRIM(u.display_name)
    ELSE NULL
  END,
  u.birthday,
  COALESCE(u.created_at, now()),
  COALESCE(u.updated_at, now())
FROM public.users u
WHERE u.is_system IS NOT TRUE
  AND EXISTS (SELECT 1 FROM auth.users au WHERE au.id = u.id)
ON CONFLICT (id) DO UPDATE SET
  avatar_url = COALESCE(v2_profiles.avatar_url, EXCLUDED.avatar_url),
  phone      = COALESCE(v2_profiles.phone,      EXCLUDED.phone),
  first_name = COALESCE(v2_profiles.first_name, EXCLUDED.first_name),
  last_name  = COALESCE(v2_profiles.last_name,  EXCLUDED.last_name),
  nickname   = COALESCE(v2_profiles.nickname,   EXCLUDED.nickname),
  birthdate  = COALESCE(v2_profiles.birthdate,  EXCLUDED.birthdate),
  updated_at = now();

-- Now that authors have profiles, link the articles that couldn't resolve an
-- author during the 00185 import (only the org creator existed back then).
UPDATE public.v2_articles a
SET author_id = a.legacy_author_id
WHERE a.author_id IS NULL
  AND a.legacy_author_id IS NOT NULL
  AND EXISTS (SELECT 1 FROM public.v2_profiles p WHERE p.id = a.legacy_author_id);
