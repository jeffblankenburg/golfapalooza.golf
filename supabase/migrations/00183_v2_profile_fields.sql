-- Structured profile fields for v2 members. Additive only.
-- Captured either by the inviter (stored on v2_invites as a prefill) or by the
-- new user at confirm time (written to v2_profiles). first/last are required for
-- a completed profile (enforced in the API, not the DB, since an invite may be
-- created before they're known). display_name is derived: nickname || "First Last".

ALTER TABLE public.v2_profiles
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS zip TEXT;

ALTER TABLE public.v2_invites
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name TEXT,
  ADD COLUMN IF NOT EXISTS nickname TEXT,
  ADD COLUMN IF NOT EXISTS birthdate DATE,
  ADD COLUMN IF NOT EXISTS zip TEXT;
