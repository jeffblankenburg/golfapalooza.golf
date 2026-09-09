-- v2 articles: featured/published content for the platform, migrated from the
-- legacy `articles` table (same database, so a plain INSERT ... SELECT copies it).
--
-- Denormalization vs. legacy:
--   * image_url is resolved ONCE here (gallery media_url → thumbnail_url → direct
--     url), so v2 never has to touch legacy gallery_items. Files stay in the same
--     public bucket, so the URLs keep working.
--   * legacy_article_id / legacy_author_id preserve provenance for future ETL.
--   * author_id links to v2_profiles only when a profile already exists for the
--     legacy author (others stay NULL until the user ETL runs).
--   * All legacy articles map to the org (event_id NULL) — legacy trip_settings
--     has no year to align with v2_events, so they land as org-level archive and
--     the home module falls back to the latest org article.

DROP TABLE IF EXISTS public.v2_articles;

CREATE TABLE public.v2_articles (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.v2_organizations(id) ON DELETE CASCADE,
  event_id          UUID REFERENCES public.v2_events(id) ON DELETE SET NULL,
  legacy_article_id UUID UNIQUE,
  author_id         UUID REFERENCES public.v2_profiles(id) ON DELETE SET NULL,
  legacy_author_id  UUID,
  title             TEXT NOT NULL,
  content           TEXT NOT NULL DEFAULT '',
  image_url         TEXT,
  image_focal_x     SMALLINT NOT NULL DEFAULT 50,
  image_focal_y     SMALLINT NOT NULL DEFAULT 50,
  publish_at        TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_v2_articles_org_publish ON public.v2_articles(org_id, publish_at DESC NULLS LAST);
CREATE INDEX idx_v2_articles_event       ON public.v2_articles(event_id);

ALTER TABLE public.v2_articles ENABLE ROW LEVEL SECURITY;

-- Org members read PUBLISHED articles; admins manage everything (incl. drafts).
CREATE POLICY "v2_article_select" ON public.v2_articles FOR SELECT
  TO authenticated
  USING (
    public.v2_is_org_member(org_id)
    AND publish_at IS NOT NULL
    AND publish_at <= now()
  );
CREATE POLICY "v2_article_admin" ON public.v2_articles FOR ALL
  TO authenticated
  USING (public.v2_is_org_admin(org_id))
  WITH CHECK (public.v2_is_org_admin(org_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.v2_articles
  TO authenticated, service_role;

-- ── Backfill from legacy articles ────────────────────────────────────────────
INSERT INTO public.v2_articles
  (org_id, legacy_article_id, author_id, legacy_author_id, title, content,
   image_url, image_focal_x, image_focal_y, publish_at, created_at, updated_at)
SELECT
  o.id,
  a.id,
  p.id,
  a.author_id,
  a.title,
  COALESCE(a.content, ''),
  COALESCE(gi.media_url, gi.thumbnail_url, a.featured_image_url),
  COALESCE(a.featured_image_focal_x, 50),
  COALESCE(a.featured_image_focal_y, 50),
  a.publish_at,
  COALESCE(a.created_at, now()),
  COALESCE(a.updated_at, now())
FROM public.articles a
CROSS JOIN (
  SELECT id FROM public.v2_organizations WHERE slug = 'golfapalooza' LIMIT 1
) o
LEFT JOIN public.gallery_items gi ON gi.id = a.featured_image_id
LEFT JOIN public.v2_profiles  p  ON p.id = a.author_id
ON CONFLICT (legacy_article_id) DO NOTHING;
