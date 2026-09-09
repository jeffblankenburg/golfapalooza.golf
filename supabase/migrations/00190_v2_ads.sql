-- v2 sponsor ads ("fake ads" — humor banner sponsors), migrated from the legacy
-- fake_ads table. Same public gallery-media bucket, so image URLs keep working.
-- Org-scoped. Legacy per-Loozer tagging (fake_ad_loozers) is intentionally NOT
-- carried over yet — v2 has no loozer profile page to click through to; the
-- carousel is display-only for now.

DROP TABLE IF EXISTS public.v2_ads;

CREATE TABLE public.v2_ads (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  legacy_ad_id  UUID UNIQUE,
  image_url     TEXT NOT NULL,
  alt_text      TEXT,
  active        BOOLEAN NOT NULL DEFAULT true,
  sort_order    INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_ads_org_active ON public.v2_ads(org_id, active);

ALTER TABLE public.v2_ads ENABLE ROW LEVEL SECURITY;

-- Members read active ads; admins manage everything.
CREATE POLICY "v2_ads_select" ON public.v2_ads FOR SELECT
  TO authenticated
  USING (public.v2_is_org_member(org_id) AND active = true);
CREATE POLICY "v2_ads_admin" ON public.v2_ads FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_ads TO authenticated, service_role;

-- Backfill from legacy fake_ads into the Golfapalooza org.
INSERT INTO public.v2_ads (org_id, legacy_ad_id, image_url, alt_text, active, sort_order, created_at, updated_at)
SELECT
  o.id,
  fa.id,
  fa.image_url,
  fa.alt_text,
  fa.active,
  fa.sort_order,
  COALESCE(fa.created_at, now()),
  COALESCE(fa.updated_at, now())
FROM public.fake_ads fa
CROSS JOIN (
  SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1
) o
ON CONFLICT (legacy_ad_id) DO NOTHING;
