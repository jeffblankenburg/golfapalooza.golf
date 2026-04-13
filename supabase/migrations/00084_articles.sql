-- Migration: Articles system
-- Adds articles table for admin-published content with draft/schedule/publish lifecycle

CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trip_settings(id) ON DELETE CASCADE,
  author_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  title varchar(300) NOT NULL,
  content text NOT NULL DEFAULT '',
  featured_image_id uuid REFERENCES public.gallery_items(id) ON DELETE SET NULL,
  publish_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_trip_publish
  ON public.articles (trip_id, publish_at DESC NULLS LAST);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION public.update_articles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_articles_updated_at ON public.articles;
CREATE TRIGGER set_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_articles_updated_at();

-- RLS
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Players can only see published articles
DROP POLICY IF EXISTS "Published articles are readable" ON public.articles;
CREATE POLICY "Published articles are readable" ON public.articles
  FOR SELECT USING (publish_at IS NOT NULL AND publish_at <= now());

-- Service role (admin client) can do everything
DROP POLICY IF EXISTS "Service role full access" ON public.articles;
CREATE POLICY "Service role full access" ON public.articles
  FOR ALL USING (true) WITH CHECK (true);
