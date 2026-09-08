-- Persist per-domain verification state for the v2 custom-domain automation.
-- Additive only. `verification` holds any Vercel ownership challenge (TXT records
-- to add); `misconfigured` mirrors Vercel's DNS-config check; `last_checked_at`
-- is stamped by the verify endpoint + cron. A domain skins the app only when
-- verified=true (set once Vercel reports verified && !misconfigured).

ALTER TABLE public.v2_org_domains
  ADD COLUMN IF NOT EXISTS verification JSONB,
  ADD COLUMN IF NOT EXISTS misconfigured BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_checked_at TIMESTAMPTZ;
