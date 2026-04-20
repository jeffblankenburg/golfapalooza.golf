-- ===========================================
-- Fake Ads
-- Admin-uploaded humor banner ads shown on the
-- home page, spectator home, and (when tagged)
-- on Loozer profile pages.
-- ===========================================

CREATE TABLE IF NOT EXISTS public.fake_ads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url TEXT NOT NULL,
  alt_text TEXT,
  active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fake_ads_active ON public.fake_ads(active);

-- Join table: ads can tag multiple Loozers (optional)
CREATE TABLE IF NOT EXISTS public.fake_ad_loozers (
  ad_id UUID NOT NULL REFERENCES public.fake_ads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (ad_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fake_ad_loozers_user ON public.fake_ad_loozers(user_id);

ALTER TABLE public.fake_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fake_ad_loozers ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read active ads; admins can read all.
DROP POLICY IF EXISTS "Users can read active fake_ads" ON public.fake_ads;
CREATE POLICY "Users can read active fake_ads"
  ON public.fake_ads FOR SELECT TO authenticated
  USING (
    active = true
    OR EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP POLICY IF EXISTS "Admins can manage fake_ads" ON public.fake_ads;
CREATE POLICY "Admins can manage fake_ads"
  ON public.fake_ads FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

DROP POLICY IF EXISTS "Users can read fake_ad_loozers" ON public.fake_ad_loozers;
CREATE POLICY "Users can read fake_ad_loozers"
  ON public.fake_ad_loozers FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Admins can manage fake_ad_loozers" ON public.fake_ad_loozers;
CREATE POLICY "Admins can manage fake_ad_loozers"
  ON public.fake_ad_loozers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- Reuses the existing gallery-media bucket with path prefix "fake-ads/".
-- No new bucket needed; storage policies on gallery-media already permit
-- authenticated read/write (admin-only enforced at API layer).
