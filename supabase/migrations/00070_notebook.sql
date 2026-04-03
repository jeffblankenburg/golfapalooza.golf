-- Notebook: categories and notes for sharing rules, event details, and general info with players.

-- ===========================================
-- 1. notebook_categories
-- ===========================================
CREATE TABLE IF NOT EXISTS public.notebook_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notebook_categories_trip ON public.notebook_categories(trip_id);

ALTER TABLE public.notebook_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notebook_categories"
  ON public.notebook_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage notebook_categories"
  ON public.notebook_categories FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

-- ===========================================
-- 2. notebook_notes
-- ===========================================
CREATE TABLE IF NOT EXISTS public.notebook_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES public.notebook_categories(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  pinned_to VARCHAR(50) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_notebook_notes_trip ON public.notebook_notes(trip_id);
CREATE INDEX idx_notebook_notes_category ON public.notebook_notes(category_id);
CREATE INDEX idx_notebook_notes_pinned ON public.notebook_notes(pinned_to);
CREATE UNIQUE INDEX idx_notebook_notes_pinned_unique ON public.notebook_notes(trip_id, pinned_to) WHERE pinned_to IS NOT NULL;

ALTER TABLE public.notebook_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read notebook_notes"
  ON public.notebook_notes FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage notebook_notes"
  ON public.notebook_notes FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true))
  WITH CHECK (EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true));

CREATE TRIGGER notebook_notes_updated_at
  BEFORE UPDATE ON public.notebook_notes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
