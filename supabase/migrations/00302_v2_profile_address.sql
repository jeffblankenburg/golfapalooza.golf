-- 00302_v2_profile_address.sql
-- Consolidate member address into ONE set of fields (address + existing city/state/zip),
-- and replace the on/off `show_on_map` boolean with a granularity choice so a member
-- picks exactly how precisely they appear on the member map.
--
--   address        — street line (replaces the old payment-only `mailing_address`)
--   map_visibility — 'address' | 'city' | 'state' | 'off' (replaces `show_on_map`)
--
-- The mailing address was previously a separate payment-only field; it is now the
-- member's one real address, useful for mail AND (at the member's chosen precision)
-- the member map. city/state/zip are unchanged.

ALTER TABLE public.v2_profiles ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE public.v2_profiles ADD COLUMN IF NOT EXISTS map_visibility TEXT NOT NULL DEFAULT 'off';

-- Preserve existing data: the old mailing address becomes the street address, and
-- anyone currently opted into the map keeps a (privacy-safe) city-level pin.
UPDATE public.v2_profiles SET address = mailing_address WHERE address IS NULL AND mailing_address IS NOT NULL;
UPDATE public.v2_profiles SET map_visibility = CASE WHEN show_on_map THEN 'city' ELSE 'off' END;

ALTER TABLE public.v2_profiles DROP CONSTRAINT IF EXISTS v2_profiles_map_visibility_chk;
ALTER TABLE public.v2_profiles ADD CONSTRAINT v2_profiles_map_visibility_chk
  CHECK (map_visibility IN ('address', 'city', 'state', 'off'));

ALTER TABLE public.v2_profiles DROP COLUMN IF EXISTS mailing_address;
ALTER TABLE public.v2_profiles DROP COLUMN IF EXISTS show_on_map;
