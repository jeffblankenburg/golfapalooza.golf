-- Ensure Al Pine's v2 profile carries the avatar (served from public/alpine.png).
-- Idempotent belt-and-suspenders in case an is_system profile was created without
-- one (e.g. the 00216 legacy-join matched a row whose avatar had drifted).
UPDATE public.v2_profiles
SET avatar_url = '/alpine.png'
WHERE is_system = true
  AND (avatar_url IS NULL OR avatar_url = '' OR avatar_url <> '/alpine.png');
