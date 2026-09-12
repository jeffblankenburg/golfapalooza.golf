-- "Al Pine" as a v2 system personality + the announcement "send as Al Pine" flag.
--
-- v2 shares this database with the legacy app, where Al Pine already exists as a
-- public.users row (is_system = true) keyed to an auth.users id (provisioned by
-- scripts/create-al-pine.mjs). v2_profiles.id FKs the same auth.users, so we can
-- mint Al Pine's v2 profile by reusing that identity — no new auth user needed.

-- 1. Mark system profiles (bot/automated authors) so they're resolvable and can
--    be excluded from member pickers later. Defaults false so real Loozers are
--    unaffected.
ALTER TABLE public.v2_profiles
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_v2_profiles_is_system
  ON public.v2_profiles (is_system) WHERE is_system = true;

-- 2. Per-announcement opt-in to author it as the system personality.
ALTER TABLE public.v2_announcements
  ADD COLUMN IF NOT EXISTS send_as_system BOOLEAN NOT NULL DEFAULT false;

-- 3. Provision Al Pine's v2 profile from the legacy system user (reuse the auth
--    identity). No-op if the legacy Al Pine hasn't been created yet.
INSERT INTO public.v2_profiles (id, display_name, avatar_url, is_system)
SELECT u.id, 'Al Pine', '/alpine.png', true
FROM public.users u
WHERE u.is_system = true
ON CONFLICT (id) DO UPDATE
  SET is_system = true,
      display_name = EXCLUDED.display_name,
      avatar_url = EXCLUDED.avatar_url;
