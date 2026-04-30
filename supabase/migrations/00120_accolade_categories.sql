-- ============================================================
-- Editable metadata for accolade categories. Replaces the hard-
-- coded title/icon mapping that was previously baked into client
-- code. Admins can rename categories, swap icons, or add new
-- categories without redeploying.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.accolade_categories (
  category TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  short_label TEXT NOT NULL,
  icon TEXT NOT NULL,
  description TEXT,
  sort_order SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.accolade_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read accolade_categories"
  ON public.accolade_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage accolade_categories"
  ON public.accolade_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );

DROP TRIGGER IF EXISTS accolade_categories_updated_at ON public.accolade_categories;
CREATE TRIGGER accolade_categories_updated_at
  BEFORE UPDATE ON public.accolade_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Seed the canonical Golfapalooza award catalog. Idempotent via ON CONFLICT.
INSERT INTO public.accolade_categories (category, title, short_label, icon, description, sort_order) VALUES
  ('mvl',              'Most Valuable Loozer',           'MVL',     '🏆', 'Best individual scoring across the trip.',         1),
  ('roy',              'Rookie of the Year',             'ROY',     '🌱', 'Best first-year Loozer.',                          2),
  ('green_jacket',     'Green Jacket',                   'GJ',      '🧥', 'Scramble champion.',                               3),
  ('bspitw',           'Best Shot Played In The World',  'BSPITW',  '🎯', 'Signature shot of the trip.',                      4),
  ('melc',             'Most Embarrassing Loozer Cup',   'MELC',    '🤡', 'Worst score / shame trophy.',                      5),
  ('cornhole_singles', 'Singles Cornhole Champion',      'CH 1s',   '👑', 'Solo cornhole champion.',                          6),
  ('cornhole_doubles', 'Doubles Cornhole Champions',     'CH 2s',   '🤝', 'Two-person cornhole team champions.',              7),
  ('custom',           'Custom Accolade',                'Custom',  '🏵️', 'Admin-defined per-trip honor.',                    99)
ON CONFLICT (category) DO NOTHING;

-- Replace the static CHECK constraint with a FK so admins can add new
-- categories from the management UI without a migration.
ALTER TABLE public.accolades
  DROP CONSTRAINT IF EXISTS accolades_category_check;

ALTER TABLE public.accolades
  DROP CONSTRAINT IF EXISTS accolades_category_fkey;

ALTER TABLE public.accolades
  ADD CONSTRAINT accolades_category_fkey
  FOREIGN KEY (category)
  REFERENCES public.accolade_categories(category)
  ON UPDATE CASCADE
  ON DELETE RESTRICT;
