-- v2 Articles parity (#195): pinning, publish notifications, and view tracking.
--
-- Columns on v2_articles:
--   pinned_at         — non-null = pinned to the top of the list + featured on the
--                       home module; most-recently-pinned wins ties.
--   notify_on_publish — admin opt-in (editor checkbox, default true). When true,
--                       the FIRST time the article goes live fires one push to
--                       every active member. The activity-feed entry is logged
--                       regardless of this flag (publishing is always feed-worthy).
--   notified_at       — one-time tombstone claimed when the go-live broadcast runs
--                       (inline "publish now" or the cron), so neither path can
--                       double-send and later edits never re-broadcast.
--   view_count        — denormalized count of unique readers (maintained by the
--                       trigger below) for the admin manager.

ALTER TABLE public.v2_articles
  ADD COLUMN IF NOT EXISTS pinned_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notify_on_publish BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notified_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS view_count        INTEGER NOT NULL DEFAULT 0;

-- Every article that is ALREADY live must be stamped as already-broadcast, or the
-- first cron tick would treat the whole back catalog as due and blast everyone.
UPDATE public.v2_articles
  SET notified_at = now()
  WHERE notified_at IS NULL
    AND publish_at IS NOT NULL
    AND publish_at <= now();

-- Partial index backing the cron's "due, not-yet-broadcast" scan.
CREATE INDEX IF NOT EXISTS idx_v2_articles_publish_notify
  ON public.v2_articles (publish_at)
  WHERE notified_at IS NULL;

-- Pinned-first ordering (list + home featured).
CREATE INDEX IF NOT EXISTS idx_v2_articles_pinned
  ON public.v2_articles (org_id, pinned_at DESC NULLS LAST);

-- ── Per-user view tracking ───────────────────────────────────────────────────
DROP TABLE IF EXISTS public.v2_article_views;

CREATE TABLE public.v2_article_views (
  article_id UUID NOT NULL REFERENCES public.v2_articles(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.v2_profiles(id) ON DELETE CASCADE,
  viewed_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (article_id, user_id)
);

CREATE INDEX idx_v2_article_views_article ON public.v2_article_views(article_id);

ALTER TABLE public.v2_article_views ENABLE ROW LEVEL SECURITY;

-- Reads recorded server-side via the service role; a member may only record their
-- own view, and admins may read the raw rows (counts also live on view_count).
CREATE POLICY "v2_article_views_insert_own" ON public.v2_article_views FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "v2_article_views_admin_select" ON public.v2_article_views FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.v2_articles a
      WHERE a.id = article_id AND public.v2_is_org_admin(a.org_id)
    )
  );

GRANT SELECT, INSERT ON TABLE public.v2_article_views TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_article_views TO service_role;

-- Keep v2_articles.view_count in step with unique views.
CREATE OR REPLACE FUNCTION public.bump_v2_article_view_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.v2_articles
    SET view_count = view_count + 1
    WHERE id = NEW.article_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_bump_v2_article_view_count ON public.v2_article_views;
CREATE TRIGGER trg_bump_v2_article_view_count
  AFTER INSERT ON public.v2_article_views
  FOR EACH ROW EXECUTE FUNCTION public.bump_v2_article_view_count();
