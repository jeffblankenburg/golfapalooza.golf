-- Add an is_system flag so we can mark bot/automated users (e.g. "Al Pine"
-- who posts birthday messages) and exclude them from user-facing pickers,
-- member lists, sponsor selectors, etc. Defaults to false so all existing
-- users remain real Loozers.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_users_is_system ON public.users (is_system) WHERE is_system = true;
