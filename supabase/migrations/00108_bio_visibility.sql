-- Add visibility toggle to Loozer bios.
-- When false, the bio is hidden from all public/auth read paths and only
-- appears in the admin BioManager. Existing bios default to visible so
-- behavior is unchanged on rollout.
ALTER TABLE public.loozer_bios
  ADD COLUMN IF NOT EXISTS is_visible boolean NOT NULL DEFAULT true;
