-- Per-org merch/spirit-wear store link (replaces the legacy hardcoded
-- SpiritWearCard URL). store_url is the external shop; store_label optionally
-- overrides the card's headline. Both nullable — the home Store card hides when
-- store_url is unset. Additive.

ALTER TABLE public.v2_organizations
  ADD COLUMN IF NOT EXISTS store_url TEXT,
  ADD COLUMN IF NOT EXISTS store_label TEXT;
