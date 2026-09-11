-- Per-org member-name display mode: whether the app shows members' nicknames
-- (default, e.g. "Quack") or their real names ("First Last"). Applied at render
-- time across the app; NOT baked into v2_profiles.display_name (that column is
-- shared across every org a user belongs to). Groups with no nicknames already
-- show real names via display_name's existing fallback, so 'nickname' is safe as
-- the default everywhere.

ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS name_display TEXT NOT NULL DEFAULT 'nickname'
  CHECK (name_display IN ('nickname', 'real'));
