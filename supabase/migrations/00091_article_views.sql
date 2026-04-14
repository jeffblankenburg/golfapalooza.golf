-- Track which users have read which articles
CREATE TABLE IF NOT EXISTS public.article_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id UUID NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  viewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(article_id, user_id)
);

CREATE INDEX idx_article_views_article ON public.article_views(article_id);

ALTER TABLE public.article_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can insert own article views"
  ON public.article_views
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Authenticated users can update own article views"
  ON public.article_views
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Admins can read all article views"
  ON public.article_views
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND is_admin = true)
  );
