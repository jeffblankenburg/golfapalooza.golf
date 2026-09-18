-- Per-org system identity (name + avatar) for automated/generic authorship.
--
-- Replaces the single global "Al Pine" v2_profile as the presented author of
-- "send as system" announcements (and future bot content). Each org names its own
-- system entity; the default is the generic "System". "Al Pine" is specific to
-- Golfapalooza and is backfilled below — every other tenant starts as "System".
--
-- Stored on the org (not a v2_profile) because v2_profiles.id FKs auth.users, so
-- there's no clean way to mint one system profile per tenant. The activity feed
-- and announcement views resolve system-authored rows against these columns.

ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS system_name TEXT NOT NULL DEFAULT 'System',
  ADD COLUMN IF NOT EXISTS system_avatar_url TEXT;

-- Golfapalooza keeps "Al Pine" and its avatar (served from public/alpine.png).
UPDATE public.v2_organizations
SET system_name = 'Al Pine',
    system_avatar_url = '/alpine.png'
WHERE slug = 'golfapalooza';
