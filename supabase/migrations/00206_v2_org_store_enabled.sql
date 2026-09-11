-- Admin toggle to show/hide the Store card on the home page independently of
-- whether a store link is configured, so a group can offer their store only at
-- specific times without clearing the URL. Defaults true to preserve today's
-- behavior (store shows whenever store_url is set).

ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS store_enabled BOOLEAN NOT NULL DEFAULT true;
